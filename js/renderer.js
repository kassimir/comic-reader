// const div = create('div', {style: {width: '200px', height: '200px', 'backgroundColor': 'tomato'}, id: 'test', textContent: 'Eat a Dick!'}, {'click': (e)=>{console.log(e.target.id)}})
// q('body').appendChild(div)
//

const hidden = qi('hidden')
const reader = qi('reader')
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
    if (e.channel === 'end') {
      console.log(frontPage)
    } else if (e.channel === 'msg') console.log(e.args[0])
    else if (e.channel === 'tab-newest') frontPage.newest[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
    else if (e.channel === 'tab-top-day') frontPage.topday[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
    else if (e.channel === 'tab-top-week') frontPage.topweek[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
    else if (e.channel === 'tab-top-month') frontPage.topmonth[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
    else if (e.channel === 'tab-mostview') frontPage.mostpopular[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
    else if (e.channel === 'latest') frontPage.latest[e.args[0].title] = new Tile(e.args[0].img, e.args[0].link)
  }
  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})
}

window.onload = function() {
  mainRender()
}
// mainRender()

function bgRender(src, preload, listeners) {
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners, true)
  hidden.appendChild(backgroundWebview)
}


class Tile {
  constructor(img, link) {
    this.img = img
    this.link = link
  }
}