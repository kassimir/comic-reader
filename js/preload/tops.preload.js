const send = require('../utils').send
const removeIssue = require('../utils').getOrRemoveIssue
window.console.clear = () => console.log('tried to clear console')

window.addEventListener('DOMContentLoaded', onload)

const loaded = {
  'tab-newest': false,
  'tab-top-day': false,
  'tab-top-week': false,
  'tab-top-month': false,
  'tab-mostview': false,
  'latest': false
}

function onload() {
  // Keeps all the data scraping asynchronous and allows
  // to know when it's completed without using counters
  Promise.all([
    Promise.resolve(getData('tab-newest')),
    Promise.resolve(getData('tab-top-day')),
    Promise.resolve(getData('tab-top-week')),
    Promise.resolve(getData('tab-top-month')),
    Promise.resolve(getData('tab-mostview')),
    Promise.resolve(getLatest())
  ])
}

// Most the sections have the same layout with different id's
function getData(id) {
  const tops = document.getElementById(id)
  if (!tops || !tops.children) return setTimeout(getData, 2000, id)
  Array.from(tops.children).forEach( div => {
    const res = {}
    Array.from(div.children).forEach( inner => {
      if (inner.href && inner.children && inner.textContent !== 'More...') {
        if (inner.children[0].nodeName === 'IMG') {
          res.link = checkHref(inner.href)
          res.img = checkHref(inner.children[0].src)
        } else {
          res.title = inner.children[0].textContent.trim().replace(/[\n\r]/g, '')
        }
      }
    })
    if (Object.keys(res).length) send(res, id)
  })
  loaded[id] = true
  checkDone()
}

// Latest Updated is not one of those sections, so it gets
// its own function
function getLatest() {
  const l = document.getElementsByClassName('items')
  if (!l[0] || !l[0].children.length) return setTimeout(getLatest, 2000)
  const latest = l[0].children
  Array.from(latest).forEach( outer => {
    Array.from(outer.children).forEach( inner => {
      const link = checkHref(inner.href)
      const imgLink = inner.children[0].src || inner.children[0].getAttribute('srctemp')
      const img = checkHref(imgLink)
      const title = (inner.childNodes[2].textContent).trim().replace(/[\n\r]/g, '')
      send({link: link, img: img, title: title}, 'latest')
    })
  })
  loaded['latest'] = true
  checkDone()
}

// Quick check to insure the links
// aren't absolute paths
const checkHref = lnk => {
  send(lnk)
  return lnk.includes('http') ? lnk : `http://readcomiconline.to/${lnk}`
}

function checkDone() {
  let all = true
  Object.keys(loaded).forEach( key => {
    if (!loaded[key]) all = false
  })
  if (all) send('done', 'end')
}