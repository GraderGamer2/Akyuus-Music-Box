const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  search: call('search'), loadStore: call('store:get'), saveStore: call('store:set'),
  openYouTube: call('open-youtube'), openDataFolder: call('app:open-data'), relaunch: call('app:relaunch'),
  listFonts: call('fonts:list'), gfxInfo: call('gfx:info'),
  watchPlay: call('watch:play'), watchStop: call('watch:stop'), watchRect: call('watch:rect'), watchVisible: call('watch:visible'),
  beat: () => ipcRenderer.send('beat'),
  setPrivacy: (on) => ipcRenderer.send('privacy:set', !!on),
  onWatchEnded: (cb) => ipcRenderer.on('watch:ended', () => cb()),
});
