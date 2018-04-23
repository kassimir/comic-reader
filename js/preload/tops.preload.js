const send = require('../utils').send
const removeIssue = require('../utils').getOrRemoveIssue

window.onload = onload

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
  ]).then(() => send('done', 'end'))
}

// Most the sections have the same layout with different id's
function getData(id) {
  const tops = document.getElementById(id)
  Array.from(tops.children).forEach( div => {
    const res = {}
    Array.from(div.children).forEach( inner => {
      if (inner.href && inner.children && inner.textContent !== 'More...') {
        if (inner.children[0].nodeName === 'IMG') {
          res.link = checkHref(inner.href)
          res.img = inner.children[0].src
        } else {
          res.title = inner.children[0].textContent.trim().replace(/[\n\r]/g, '')
        }
      }
    })
    if (Object.keys(res).length) send(res, id)
  })
}

// Latest Updated is not one of those sections, so it gets
// its own function
function getLatest() {
  const latest = document.getElementsByClassName('items')[0].children
  Array.from(latest).forEach( outer => {
    Array.from(outer.children).forEach( inner => {
      const link = inner.href
      const img = inner.children[0].src || inner.children[0].getAttribute('srctemp')
      const title = removeIssue(inner.textContent, 'name').trim().replace(/[\n\r]/g, '')
      send({link: link, img: img, title: title}, 'latest')
    })
  })
}

// Quick check to insure the links
// aren't absolute paths
const checkHref = lnk => lnk.includes('http://readcomiconline.to') ? lnk : `http://readcomiconline.to/${link}`
