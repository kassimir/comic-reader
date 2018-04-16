const ipc = require('electron').ipcRenderer
const send = (msg, channel = 'default') => ipc.sendToHost(channel, msg)

window.onload = function() {
  Promise.all([
    Promise.resolve(getData('tab-newest')),
    Promise.resolve(getData('tab-top-day')),
    Promise.resolve(getData('tab-top-week')),
    Promise.resolve(getData('tab-top-month')),
    Promise.resolve(getData('tab-mostview')),
    Promise.resolve(getLatest())
  ]).then(() => send('done', 'end'))
}

function getData(id) {
  const tops = document.getElementById(id)
  Array.from(tops.children).forEach( div => {
    const res = {}
    Array.from(div.children).forEach( inner => {
      if (inner.href && inner.children[0]) {
        if (inner.children[0].nodeName === 'IMG') {
          res.link = inner.href
          res.img = inner.children[0].src
        } else {
          res.title = inner.children[0].textContent
        }
      }
    })
    send(res, id)
  })
}

function getLatest() {
  const latest = document.getElementsByClassName('items')[0].children
  Array.from(latest).forEach( outer => {
    Array.from(outer.children).forEach( inner => {
      const link = inner.href
      const img = inner.children[0].src || inner.children[0].getAttribute('srctemp')
      const title = inner.innerText
      send({link: link, img: img, title: title.trim()}, 'latest')
    })
  })
}