const Tile = require('./js/models/tile.model')

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')
// This is the object from which the main page will be built
const frontPage = {
  latest: {},
  newest: {},
  topday: {},
  topweek: {},
  topmonth: {},
  mostpopular: {}
}

// STEP ONE:
// Navigate to the site, then steal its front page
function mainRender() {
  function ipcMessage(e) {
    switch(e.channel) {
      case 'msg': console.log(e.args[0]); break
      case 'tab-newest': frontPage.newest[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'tab-top-day': frontPage.topday[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'tab-top-week': frontPage.topweek[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'tab-top-month': frontPage.topmonth[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'tab-mostview': frontPage.mostpopular[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'latest': frontPage.latest[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link); break
      case 'end': buildTiles(); break
      default: console.log(e);
    }
  }
  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})
}

window.onload = function() {
  mainRender()
}

function bgRender(src, preload, listeners) {
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners)
  hidden.appendChild(backgroundWebview)
}

function buildTiles() {
  hidden.removeChild(q('webview'))
  const carousel = () => create('div', {class: 'carousel-outer', style: {'margin-bottom': '35px'}})

  for (let section in frontPage) {
    const c = carousel()
    c.id = section
    const div = create('div', {class: 'carousel-inner'})
    div.style.width = Object.keys(frontPage[section]).length * 20 + '%'
    reader.appendChild(c)

    for (let item in frontPage[section]) {
      const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}})
      const img = create('img', {src: frontPage[section][item].img, style: {width: '20vw', margin: '0 2.25vw'}})
      container.appendChild(img)
      div.appendChild(container)
      c.appendChild(div)
    }
  }
}