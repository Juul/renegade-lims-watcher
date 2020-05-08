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

if(settings.watchPath) {
  startWatching(settings.watchPath);
}
  



  



