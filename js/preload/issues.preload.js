const ipc = require('electron').ipcRenderer
const send = (msg, channel = 'default') => ipc.sendToHost(channel, msg)

window.onload = onload

function onload() {
  // The section with the information about the comic
  const about = document.querySelector('.barContent')
  // Mmmmm... recursion
  if (!about) onload()
  // All the infos!
  const info = about.children[0].querySelectorAll('p')
  const data = {
    'title': about.querySelector('.bigChar').textContent,
    'artist': [],
    'genres': [],
    'publicationdate': '',
    'publisher': [],
    'summary': 'poop',
    'writer': []
  }
  // If they ever change their site, this whole thing is screwed
  // Gets all the specific data to build the description info
  info.forEach(item => {
    if (!item.children.length && item.textContent) data.summary = item.textContent
    else if (!item.children.length) return
    const children = Array.from(item.children)
    let prop = '';
    children.forEach( (child, ind) => {
      if (child.textContent === 'Status:' || !child.textContent || child.textContent === 'Summary:') return
      if (ind === 0) prop = child.textContent.replace(/[:, \s]/g, '').toLowerCase()
      else if (child.nodeName === 'A') data[prop].push(child.textContent)
      if (prop === 'publicationdate') data['publicationdate'] = child.nextSibling.textContent.trim()
    })
  })
  // Send that data back to the renderer.js
  send(data)
}
