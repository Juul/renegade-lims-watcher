'use strict';

const fs = require('fs-extra');
const chokidar = require('chokidar');

const SETTINGS_PATH = "./settings.json";

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

function startWatching(watchPath) {
  console.log("Watching:", watchPath);
  const watcher = chokidar.watch(watchPath, {
    persistent: true,
    alwaysStat: true
  })

  watcher.on('add', function(filepath, stats) {
    console.log("filepath:", filepath);
  });
}

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

if(settings.watchPath) {
  startWatching(settings.watchPath);
}

//var notification = new Notification("Syncronizing...",options);
//var notification = new Notification("DONE");

 
var win = nw.Window.get();
win.moveTo(0, 0);
win.resizeTo(320, 240);
win.setAlwaysOnTop(true);

initLinks();
