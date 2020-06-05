'use strict';

const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const formatTime = require('timeago.js').format;
const chokidar = require('chokidar');
const minimist = require('minimist');
const gui = require('nw.gui');

const limsConnector = require('renegade-lims-connector');
const argv = minimist(gui.App.argv, {
  alias: {
  },
  boolean: [
    'insecure' // don't validate TLS certs
  ],
  default: {
  }
});

const SETTINGS_PATH = "settings.json";

var remote; // the remote rpc functions after we connect
var lastScanTime;

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, {encoding: 'utf8'}, JSON.stringify(settings))
}

function loadSettings() {
  var settings;
  try {
    const data = fs.readFileSync(SETTINGS_PATH, {encoding: 'utf8'})
    settings = JSON.parse(data);
  } catch(e) {
    settings = {};
    saveSettings(settings);
  }
  return settings;
}

const settings = loadSettings();

function gotoPage(pageName) {
  const pages = document.querySelectorAll('.page');
  for(let page of pages) {
    page.style.display = 'none';
  }
  const curPage = document.getElementById('page-'+pageName);
  curPage.style.display = 'block';
}

function clickedLink(e) {
  e.preventDefault();
  var href = e.target.getAttribute('href');
  if(!href) return;
  var m = href.match(/^#(.*)/)
  if(!m) return;

  const pageName = m[1];
  gotoPage(pageName);
}

function initLinks() {
  const links = document.querySelectorAll('a');
  var link, href, m;
  for(link of links) {
    href = link.getAttribute('href');
    if(!href) continue;
    m = href.match(/^#(.*)/)
    if(!m) continue;
    
    link.addEventListener('click', clickedLink);
  }
  
}
function capitalize(str) {
  if(!str) return;

  return str[0].toUpperCase() + str.slice(1);
}

function parseXML(str) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(str, 'application/xml');
  
  // Check for errors according to:
  // https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
  var errs = doc.getElementsByTagName('parsererror');
  if(errs.length) {
    var txt = errs[0].textContent;
    txt = txt.replace(/Below is a rendering.*/i, ''); // remove useless message
    txt = txt.replace(':', ': ').replace(/\s+/, ' '); // improve formatting
    throw new Error("Parsing XML failed: " + txt);
  }
  return doc;
}

function openXML(filepath, cb) {
  fs.readFile(filepath, {encoding: 'utf8'}, function(err, data) {
    if(err) return cb(err);
    try {
      const doc = parseXML(data);
      cb(null, doc);
    } catch(e) {
      return cb(e);
    }
  });
}

function showError(err) {
  var el = document.getElementById('error-msg');
  el.innerHTML = err.toString();
  el = document.querySelector('.error');
  el.style.display = "block";

}

function updateLastScan(keepUpdating) {

  var el = document.getElementById('last-scan-time');
  if(!lastScanTime) {
    el.innerHTML = "Never"
  } else {
    el.innerHTML = capitalize(formatTime(lastScanTime));
  }
  
  if(keepUpdating) {
    setTimeout(function() {
      updateLastScan(keepUpdating);
    }, keepUpdating);
  }
}

function setStatus(status) {
  var el = document.getElementById('status');

  el.innerHTML = status;
}


// Called on connect
function reportAll() {

  fs.readdir(settings.watchPath, function(err, files) {
    async.eachSeries(function(filename, next) {
      if(!filename.match(/\.xml$/i)) return next();

      handeFile(path.join(settings.watchPath, filename), function(err) {
        if(err) console.error(err);

        next();
      });
    });
  });
}

// move reported file away so it isn't reported again
function moveFile(srcPath, cb) {
  console.log("movefile called");
  cb = cb || function(){};
  var filename = path.basename(srcPath);
  var destPath = path.join(settings.syncedPath, filename);
  console.log("moveFile:", srcPath, destPath);
  fs.move(srcPath, destPath, cb);
}

function reportScanData(data, cb) {
  if(!remote) {
    console.log("Not connected so not reporting data");
    return cb();
  }
  
  console.log("Got:", data);

  lastScanTime = new Date();
  updateLastScan();

  remote.reportScan(data, cb);
}

function parseNewFile(filepath, numTries, cb) {
  openXML(filepath, function(err, doc) {
    if(err) {
      numTries = numTries || 0;
      if(numTries >= 2) {
        showError("Failed to read file: " + filepath);
      }
      setTimeout(function() {
        parseNewFile(filepath, numTries+1, cb);
      }, 3000);
      return;
    }
    
    var o = {
      parsedAt: (new Date()).getTime(),
      wells: {}
    };
    
    var el = doc.querySelector('CodeReaderDocument > DocumentProperties > DateCreated');
    if(el) {
      o.scannedAt = new Date(el.innerHTML);
    }

    el = doc.querySelector('CodeReaderDocument > ErrorInfo > ErrorNumber');
    if(el) {
      var errorNum = parseInt(el.innerHTML);
      if(parseInt(el.innerHTML) !== 0) {
        o.scanError = true;
      }
    }

    el = doc.querySelector('CodeReaderDocument > CodeIdentification > RackCode');
    if(!el) {
      return cb(new Error("Rack barcode element not present"));
    }
    o.rackBarcode = el.getAttribute('CodeValue');
    if(!o.rackBarcode) {
      return cb(new Error("Rack barcode attribute not present"));
    }
    
    var els = doc.querySelectorAll('CodeReaderDocument > CodeIdentification > CodeGroups > CodeGroup[Name=Tubes] > CodeItems > Code');
    
    var err, wellName, wellNumber, wellBarcode;
    for(el of els) {
      err = el.getAttribute('Error');
      if(!err || parseInt(err) !== 0) continue;

      wellName = el.getAttribute('PositionText');
      if(!wellName) continue;
      
      wellNumber = el.getAttribute('PositionNumber');
      if(!wellNumber) continue;

      wellBarcode = el.getAttribute('CodeValue');
      if(!wellBarcode) continue;

      if(o.wells[wellName]) {
        return cb(new Error("Saw two scan values for one well"));
      }

      o.wells[wellName] = {
        wellName,
        wellNumber,
        barcode: wellBarcode
      };
    }

    cb(null, o);
  });
}

function handleFile(filepath, cb) {
  console.log("File appeared:", filepath);

  // give the decapper software some time to write the file
  setTimeout(function() {
    
    parseNewFile(filepath, null, function(err, data) {
      if(err) {
        // TODO display error in UI
        console.error(err);
        return;
      }
      
      reportScanData(data, function(err) {
        if(err) {
          // TODO display error in UI
          console.error(err);
          return;            
        }
        moveFile(filepath, cb);
      });
    });
  }, 1000);
}


function startWatching(watchPath) {
  console.log("Watching:", watchPath);
  const watcher = chokidar.watch(watchPath, {
    persistent: true,
    alwaysStat: true,
    depth: 0
  })

  watcher.on('add', handleFile);
}

if(settings.watchPath) {
  startWatching(settings.watchPath);
}
 
var win = nw.Window.get();
win.moveTo(0, 0);
win.resizeTo(320, 240);
win.setAlwaysOnTop(true);

initLinks();

updateLastScan(5000);

function connect() {
  var opts = {
    host: settings.host,
    port: settings.port,
    insecure: argv.insecure,
    tlsCert: fs.readFileSync(settings.tls.certPath),
    tlsKey: fs.readFileSync(settings.tls.keyPath),
    debug: true
  };

  if(!argv.insecure) {
    opts.serverTLSCert = fs.readFileSync(settings.tls.serverCertPath);
  }
  
  limsConnector(opts, function(err, rem) {
    if(rem) { // connected!
      remote = rem;
      console.log("Connected!");
      setStatus("Connected");
      reportAll();
    } else { // disconnected (after having been connected)
      remote = null;
      console.log("Disconnected", err);
    }

  });

}

try {
  connect();
} catch(e) {
  console.error("Unable to connect:", e);
}
