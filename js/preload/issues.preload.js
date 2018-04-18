const ipc = require('electron').ipcRenderer
const send = (msg, channel = 'default') => ipc.sendToHost(channel, msg)

window.onload = function() {
  const about = document.querySelector('.barContent')
  send(about.innerHTML)
}