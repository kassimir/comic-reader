const Tile = require('./js/models/tile.model')
const utils = require('./js/utils.js')
const qi = utils.qi
const q = utils.q
const create = utils.create

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
  // Destroy the hidden webview
  clearHidden()

  for (let section in frontPage) {
    function loadSearch(e) {
      navigation('description', {link: e.target.dataset.link, section: e.target.dataset.section})
    }
    const heading = () => {
      switch (section) {
        case 'newest': return 'MOST RECENTLY ADDED'
        case 'topday': return 'TOP TODAY'
        case 'topweek': return 'TOP WEEK'
        case 'topmonth': return 'TOP MONTH'
        case 'mostpopular': return 'TOP OF ALL TIME'
        case 'latest': return 'MOST RECENTLY UPDATED'
      }
    }
    const sectionHeading = create('p', {textContent: heading(), class: 'section-title'})
    const description = create('div', {class: 'section-desc', id: `${section}-desc`})
    const carousel = create('div', {class: 'carousel-outer'})

    carousel.id = section
    // TODO: Make it so that the image has a mouseover overlay of a > and clicking
    // TODO: it will go directly to the comic issues instead of the description
    const div = create('div', {class: 'carousel-inner', style: {width: Object.keys(frontPage[section]).length * 20 + '%'}}, {'click': loadSearch})
    reader.appendChild(sectionHeading)
    reader.appendChild(carousel)
    reader.appendChild(description)

    for (let item in frontPage[section]) {
      const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}})
      const img = create('img', {'data-link': frontPage[section][item].link, 'data-section': section, class: 'link', src: frontPage[section][item].img, style: {width: '20vw', margin: '0 2.25vw'}})
      const title = create('span', {'data-link': frontPage[section][item].link, 'data-section': section, class: 'link', innerText: item, style: {color: 'white', margin: '7px'}})
      container.appendChild(img)
      container.appendChild(title)
      div.appendChild(container)
      carousel.appendChild(div)
    }
  }
}

// This is the function to "navigate" between pages
// in the render div
function navigation(page, e) {
  // Shows the descriptiong of the selected comic
  if (page === 'description') {
    const descId = `${e.section}-desc`
    function ipMessage(e) {
      // destroy the hidden webview
      clearHidden()

      const desc = qi(descId)
      desc.innerHTML = ''
      const args = e.args[0]
      // TODO: remove console.log
      console.log(args)
      // I contemplated just writing everything with .innerHTML, simply because
      // there are so many elements being made, but after a lot of research, it
      // is supposed to be faster this way, so I chose it. I may update these to
      // not have inline styles. But it's hard not to utilize the amazing functionality
      // of my create function. :P

      // titleHeader is the title header. It contains the title of the comic,
      // the "Go to Comic" and "Add to Reading List", and the close button
      const titleHeader = create('div', {class: 'desc-title'})
      const title = create('p', {textContent: args.title})
      const optionsContainer = create('div', {'style': {display: 'flex', flexDirection: 'row'}, class: 'section-desc_options'})
      const goToComic = create('span', {class: 'link', textContent: '> Go To Comic'})
      const addToReadingList = create('span', {class: 'link', textContent: '+ Add To Reading List'})
      const closeDescription = create('div', {style: {textAlign: 'right', width: '268px'}}, {'click': () => desc.innerHTML = ''})
      const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '10px'}})

      optionsContainer.appendChild(goToComic)
      optionsContainer.appendChild(addToReadingList)
      closeDescription.appendChild(closeDesc)
      titleHeader.appendChild(optionsContainer)
      titleHeader.appendChild(title)
      titleHeader.appendChild(closeDescription)

      // Description
      const descContainer = create('div', {class: 'desc-info'})
      const info = create('div', {style: {width: '30%', display: 'flex', flexDirection: 'column'}})
      // This might be considered sloppy code, but I like brevity. Sue me.
      const genre = create('p', {textContent: `${args.genres.length > 1 ? 'Genres' : 'Genre'}: ${args.genres.join(', ')}`, fontWeight: 'bold'})
      const writer = create('p', {textContent: `${args.writer.length > 1 ? 'Writers' : 'Writer'}: ${args.writer.join(', ')}`, fontWeight: 'bold'})
      const artist = create('p', {textContent: `${args.artist.length > 1 ? 'Artists' : 'Artist'}: ${args.artist.join(', ')}`, fontWeight: 'bold'})
      const publisher = create('p', {textContent: `${args.publisher.length > 1 ? 'Publishers' : 'Publisher'}: ${args.publisher.join(', ')}`, fontWeight: 'bold'})
      const publicationdate = create('p', {textContent: `Publication Date: ${args.publicationdate}`})

      info.appendChild(genre)
      info.appendChild(writer)
      info.appendChild(artist)
      info.appendChild(publisher)
      info.appendChild(publicationdate)
      descContainer.appendChild(info)

      const summary = create('div', {style: {width: '70%', display: 'flex', flexDirection: 'column'}})
      const summaryTitle = create('p', {textContent: 'Summary:'})
      const summarySummary = create('p', {textContent: args.summary})

      summary.appendChild(summaryTitle)
      summary.appendChild(summarySummary)
      descContainer.appendChild(summary)

      desc.appendChild(titleHeader)
      desc.appendChild(descContainer)
    }
    bgRender(e.link, './js/preload/issues.preload.js', {'ipc-message': ipMessage})
  }
}

// I kept forgetting to do this, so I just made a function for it
// that is easy to remember after every time I create a hidden webview
function clearHidden() {hidden.removeChild(q('webview'))}