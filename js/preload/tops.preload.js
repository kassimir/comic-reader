const send = require('../utils.js').send

window.onload = function() {
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
      if (inner.href && inner.children[0] && inner.innerText !== 'More...') {
        if (inner.children[0].nodeName === 'IMG') {
          res.link = checkHref(inner.href)
          res.img = inner.children[0].src
        } else {
          res.title = inner.children[0].textContent
        }
      }
    })
    send(res, id)
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
      const title = removeIssue(inner.innerText)
      send({link: link, img: img, title: title.trim()}, 'latest')
    })
  })
}

function removeIssue(txt, ind) {
  if (!ind) ind = 0
  // TODO: There are some comics that just have the title and issue: SEE DEADPOOL (1997) -1
  txt = txt.replace(/[\n,\r]/g, ' ')
  const possibilities = ['Issue', 'Full', 'TPB', 'Special', '_Special', 'Annual', '_Annual']
  const regex = `${possibilities[ind]}(?!.*${possibilities[ind]})`
  if (txt.match(regex)) return txt.substr(0, txt.match(regex).index - 1)
  else if (ind === possibilities.length) return txt
  else return removeIssue(txt, ind + 1)
}

function checkHref(lnk) {
  // send(lnk, 'msg')
  if (!lnk.includes('http://readcomiconline.to')) {
    send(lnk, 'msg')
    return `http://readcomiconline.to/${link}`
  }
}
