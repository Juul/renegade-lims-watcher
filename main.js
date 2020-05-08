'use strict';

const fs = require('fs-extra');
const formatTime = require('timeago.js').format;
const chokidar = require('chokidar');

const SETTINGS_PATH = "./settings.json";

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



function writeScanData(data) {
  // TODO

  lastScanTime = new Date();
  updateLastScan();
}

function parseNewFile(filepath, numTries) {
  openXML(filepath, function(err, doc) {
    if(err) {
      numTries = numTries || 0;
      if(numTries >= 2) {
        showError("Failed to read file: " + filepath);
      }
      setTimeout(function() {
        parseNewFile(filepath, numTries+1);
      }, 3000);
      return;
    }

    const el = doc.querySelector('Root > Foo');
    const data = el.innerHTML.trim();
    console.log("Got:", data);
    
    writeScanData(data);
  });
}


function startWatching(watchPath) {
  console.log("Watching:", watchPath);
  const watcher = chokidar.watch(watchPath, {
    persistent: true,
    alwaysStat: true
  })

  watcher.on('add', function(filepath, stats) {
    console.log("filepath:", filepath);

    // give the decapper software some time to write the file
    setTimeout(function() {
      parseNewFile(filepath);
    }, 500);
  });
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

