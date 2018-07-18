console.log('online: ', navigator.onLine)

const utils = require('./js/utils.js')
const qi = utils.qi
const q = utils.q
const create = utils.create
const Tile = require('./js/models/tile.model')

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')

if (!navigator.onLine) {
  // Go to download mode
  q('.section-title').forEach( i => i.style.display = 'none')
  q('.carousel-outer').forEach( i => i.style.display = 'none')
  q('.downloaded').forEach(i => i.style.display = 'block')
  const downloadDB = require(`./database/downloaded.database`)
  Object.keys(downloadDB).forEach( key => {
    buildTile(new Tile(key, `downloads/${key}/cover.jpg`, null), `downloaded`)
  })
} else {
  loader('start', true)
  window.onload = mainRender
}


/*

      <p class="section-title downloaded">DOWNLOADED COMICS</p>
      <div class="carousel-outer downloaded" id="downloadedlist">
        <div class="carousel-inner downloaded"></div>
      </div>
      <div class="section-desc downloaded" id="downloaded-desc"></div>

      <p class="section-title">READING LIST</p>
      <div class="carousel-outer" id="readinglist">
        <div class="carousel-inner"></div>
      </div>
      <div class="section-desc" id="readinglist-desc"></div>


 */

const getIssue = utils.getOrRemoveIssue
const sortIssues = utils.sortIssues
const writeRecent = utils.writeRecent
const writeReadingList = utils.writeReadingList
const deleteReadingList = utils.deleteReadingList
const downloadComic = utils.downloadComic
// This is the object from which the main page will be built
const frontPage = {
  latest: {},
  newest: {},
  topday: {},
  topweek: {},
  topmonth: {},
  mostpopular: {}
}

const currentComic = {
  title: '',
  cover: '',
  link: '',
  issue: ''
}

// This is the database for Most Recently Read
const recentDB = require('./database/recent.database')
const readingDB = require('./database/reading.database')

let descNode, issueNode, iframeTO, loaded = false

// This is for the previous and next button once the comic is loaded
// I may not need them to be global, but that's where I'm putting them
let previousIssue, nextIssue

// This is here, because the main page has a bunch of iframes on it that will
// block my code from running. This script here will force code into the page
// and destroy all the iframes and allow my code to work.
function loadCommit() {
  if (iframeTO) return
  iframeTO = setInterval(() => {
    if (!loaded && q('webview')) {
      q('webview').executeJavaScript(`document.querySelectorAll('iframe').forEach(f => f.parentElement.removeChild(f))`)
      const modal = document.querySelector('div[id*="close"]')
      if (modal && modal.innerHTML) modal.click()
    } else clearInterval(iframeTO)}, 2000)
}

// TODO: Fix the search for only one result. If there's only one result
// TODO: the website takes you to the actual comic, which throws off my code.
function search(){
  loader('start')

  const keyword = q('#search-input').value.replace(' ', '+')

  if (q('#search-results').innerHTML) q('#search-results').innerHTML = ''
  const closeSearchDiv = create('div', {style: {textAlign: 'right', paddingRight: '20px', backgroundColor: '#5E051D', visibility: 'hidden'}})
  const closeSeachButton = create('span', {class: 'link', textContent: 'X'}, {'click': () => {
      q('#search-results').innerHTML = ''
      q('#search-desc').innerHTML = ''
    }})
  closeSearchDiv.appendChild(closeSeachButton)
  q('#search-results').appendChild(closeSearchDiv)

  function ipcMessage(e) {
    if (e.channel === 'end') {
      closeSearchDiv.style.visibility = 'visible'
      clearHidden()
      return
    } else if (e.channel === 'msg') {
      console.log(e.args[0])
      return
    } else if (e.channel === 'desc') {
      clearHidden()
      navigation('description', {link: e.args[0].link, cover: e.args[0].cover, section: 'search'})
      return
    }
    const comic = e.args[0]

    if (!comic.link || !comic.title || !comic.issues) return

    const searchDiv = q('#search-results')

    const resultDiv = create('div', {class: 'search-table'})
    const icon = create('span', {class: ['fas', 'fa-info-circle']}, {'click': () => navigation('description', {section: 'search', link: comic.link})})
    const titleSpan = create('span', {textContent: comic.title, style: {marginLeft: '10px'}}, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'issue'})})
    const titleDiv = create('div')
    const issueSpan = create('span', {textContent: comic.issues}, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'issue'})})

    titleDiv.appendChild(icon)
    titleDiv.appendChild(titleSpan)
    resultDiv.appendChild(titleDiv)
    resultDiv.appendChild(issueSpan)
    searchDiv.appendChild(resultDiv)
  }

  bgRender(`http://readcomiconline.to/Search/Comic?keyword=${keyword}`, 'js/preload/search.preload.js', {'ipc-message': ipcMessage})
}

// STEP ONE:
// Navigate to the site, then steal its front page
function mainRender() {
  // Hide the Home and download button, if it is showing
  if (qi('home-download').style.visibility === 'visible') rebuild()

  function ipcMessage(e) {
    switch(e.channel) {
      case 'msg': console.log(e.args[0]); break
      case 'tab-newest': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-day': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-week': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-top-month': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'tab-mostview': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'latest': buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel); break
      case 'end': clearHidden(); break
      default: console.log(e.args[0]);
    }
  }

  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})

  // Recently Read
  if (Object.keys(recentDB).length) {
    qi('recent').style.display = 'block'
    // sort recently read by date, so it displays in the appropriate order
    const sortedRecent = Object.keys(recentDB).sort( (a, b) => {
      return new Date(recentDB[b].date) - new Date(recentDB[a].date)
    })

    sortedRecent.forEach( c => {
      const comic = recentDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'recent')
    })
  }

  // Reading List
  if (Object.keys(readingDB).length) {
    qi('readinglist').style.display = 'block'
    const sortedReading = Object.keys(readingDB).sort( (a, b) => {
      return new Date(readingDB[b].date) - new Date(readingDB[a].date)
    })

    sortedReading.forEach( c => {
      const comic = readingDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'readinglist')
    })
  }

  function rebuild() {
    loader('start', true)
    qi('home-download').style.visibility = 'hidden'
    document.body.removeChild(qi('comic'))
    q('#recent .carousel-inner').innerHTML = ''
    q('#readinglist .carousel-inner').innerHTML = ''
    q('#latest .carousel-inner').innerHTML = ''
    q('#newest .carousel-inner').innerHTML = ''
    q('#topday .carousel-inner').innerHTML = ''
    q('#topmonth .carousel-inner').innerHTML = ''
    q('#topweek .carousel-inner').innerHTML = ''
    q('#mostview .carousel-inner').innerHTML = ''
    q('#recent-desc').innerHTML = ''
    q('#readinglist-desc').innerHTML = ''
    q('#latest-desc').innerHTML = ''
    q('#newest-desc').innerHTML = ''
    q('#topday-desc').innerHTML = ''
    q('#topmonth-desc').innerHTML = ''
    q('#topweek-desc').innerHTML = ''
    q('#mostview-desc').innerHTML = ''
    q('#search-results').innerHTML = ''
    q('#search-desc').innerHTML = ''
    q('#paginate').style.display = 'none'
    q('#search').style.display = 'block'
    q('#title').textContent = ''
    q('#title').style.display = 'none'
  }
}


function buildTile(tile, section, first) {
  const sect = section.replace(/(tab|-)/g,'')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}}, {'click': onclick})
  const img = create('img', {'data-link': tile.link, 'data-section': sect, class: 'link', src: tile.img, style: {width: '20vw', margin: '0 2.25vw'}}, {'error': onerr})
  const title = create('span', {'data-link': tile.link, 'data-section': sect, class: 'link', innerText: tile.title, style: {color: 'white', margin: '7px'}})
  if (section === 'recent') container.id = tile.title.replace(/[\s()]/g, '')

  container.appendChild(img)
  container.appendChild(title)
  if (first) {
    comicDiv.insertBefore(container, comicDiv.children[0])
  } else {
    comicDiv.appendChild(container)
  }

  function onclick() {
    navigation('description', {link: tile.link, section: sect, cover: tile.img})
  }

  // The page will often send 503 errors for the images, so
  // this will keep trying to load it until it doesn't error
  // Obviously, there's no failsafe here, so if there's a
  // legitimate error (like a 404), it will try into oblivion
  // TODO: Set a default image after x amount of tries
  function onerr(e) {
    setTimeout(()=>e.target.src = e.target.currentSrc, 2000)
  }
}

// This is the function to "navigate" between pages
// in the render div
// e: link, section, cover
function navigation(page, e) {
  // Shows the descriptiong of the selected comic
  if (page === 'description') {

    // TODO: Fix this! The Toggle is bad, and the overall code is bad
    // TODO: Need to put description and issues in their own function,
    // TODO: build the elements, and then just show/hide them with the
    // TODO: toggle, instead of building them on-demand. It's gross.

    loader('start')

    const descId = `${e.section}-desc`
    const comicLink = e.link
    const issueFragment = document.createDocumentFragment()
    const descFragment = document.createDocumentFragment()

    let desc, comicTitle
    let comicCover = e.cover
    let view = 'desc'
    let loadIssue = e.view === 'issue'

    function ipcMessage(e) {
      if (e.channel === 'msg') {
        console.log(e.args[0])
        return
      }
      clearHidden()

      desc = qi(descId)
      const descArgs = e.args[0].desc
      comicTitle = descArgs.title
      if (!comicCover) comicCover = descArgs.cover

      // titleHeader is the title header. It contains the title of the comic,
      // the "Go to Comic" and "Add to Reading List", and the close button
      const titleHeader = create('div', {class: 'desc-title'})
      const title = create('p', {textContent: descArgs.title, style: {width: '34%'}})
      const optionsContainer = create('div', {'style': {display: 'flex', flexDirection: 'row', width: '33%'}, class: 'section-desc_options'})
      const descReadIcon = create('span', {class: ['fas', 'fa-list'], id: 'desc-read-icon'})
      const listIssues = create('span', {id: 'desc-issue-toggle', class: 'link', textContent: 'Show Issues'}, {'click': () => toggleView()})
      const addIcon = create('span', {class: ['fas', 'fa-plus']})
      const addToReadingList = create('span', {class: 'link', textContent: 'Add To Reading List'}, {'click': readingListAdd})
      const removeIcon = create('span', {class: ['fas', 'fa-minus']})
      const removeFromReadingList = create('span', {class: 'link', textContent: 'Remove From Reading List'}, {'click': readingListRemove})
      const closeDescription = create('div', {style: {textAlign: 'right', width: '33%'}}, {'click': () => desc.innerHTML = ''})
      const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})

      if (descId !== 'readinglist-desc') {
        optionsContainer.appendChild(addIcon)
        optionsContainer.appendChild(addToReadingList)
      } else {
        optionsContainer.appendChild(removeIcon)
        optionsContainer.appendChild(removeFromReadingList)
      }
      optionsContainer.appendChild(descReadIcon)
      optionsContainer.appendChild(listIssues)
      closeDescription.appendChild(closeDesc)
      titleHeader.appendChild(optionsContainer)
      titleHeader.appendChild(title)
      titleHeader.appendChild(closeDescription)

      // Description
      const descContainer = create('div', {class: 'desc-info'})
      const info = create('div', {style: {width: '35%', display: 'flex', flexDirection: 'column'}})
      const genre = create('p', {textContent: `${descArgs.genres.length > 1 ? 'Genres' : 'Genre'}: ${descArgs.genres.join(', ')}`, fontWeight: 'bold'})
      const writer = create('p', {textContent: `${descArgs.writer.length > 1 ? 'Writers' : 'Writer'}: ${descArgs.writer.join(', ')}`, fontWeight: 'bold'})
      const artist = create('p', {textContent: `${descArgs.artist.length > 1 ? 'Artists' : 'Artist'}: ${descArgs.artist.join(', ')}`, fontWeight: 'bold'})
      const publisher = create('p', {textContent: `${descArgs.publisher.length > 1 ? 'Publishers' : 'Publisher'}: ${descArgs.publisher.join(', ')}`, fontWeight: 'bold'})
      const publicationdate = create('p', {textContent: `Publication Date: ${descArgs.publicationdate}`})

      info.appendChild(genre)
      info.appendChild(writer)
      info.appendChild(artist)
      info.appendChild(publisher)
      info.appendChild(publicationdate)

      descContainer.appendChild(info)
      descFragment.appendChild(descContainer)

      const summary = create('div', {style: {width: '60%', display: 'flex', flexDirection: 'column'}})
      const summaryTitle = create('p', {textContent: 'Summary:'})
      const summarySummary = create('p', {textContent: descArgs.summary})

      summary.appendChild(summaryTitle)
      summary.appendChild(summarySummary)
      descContainer.appendChild(summary)

      descNode = descFragment.cloneNode(true)

      if (desc.children.length) desc.innerHTML = ''

      desc.appendChild(titleHeader)
      desc.appendChild(descFragment)

      // Build issues
      const ishArgs = e.args[0].issues
      const issueContainer = create('div', {class: 'issue-container'})

      const sortedIssuesArray = sortIssues(Object.keys(ishArgs))

      sortedIssuesArray.forEach( i => {
        let spanClass = 'link'
        if (recentDB[comicTitle] && recentDB[comicTitle].issues[getIssue(i, 'issue')]) spanClass = 'link-read'
        const a = create('span', {textContent: i, 'data-link': ishArgs[i], class: spanClass})
        issueContainer.appendChild(a)
      })

      issueFragment.appendChild(issueContainer)
      issueNode = issueFragment.cloneNode(true)

      // This is a temporary, hacky way to load issues instead of description
      if (loadIssue) toggleView()
    }

    function toggleView() {
      if (view === 'desc') {
        qi('desc-read-icon').classList.remove('fa-list')
        qi('desc-read-icon').classList.add('fa-book')
        qi('desc-issue-toggle').textContent = 'Show Description'
        let temp = issueNode.cloneNode(true)
        desc.removeChild(desc.querySelector('.desc-info'))
        desc.appendChild(issueNode)
        if (q('.issue-container span').length) {
          q('.issue-container span').forEach( i => i.addEventListener('click', onclick))
        } else {
          q('.issue-container span').addEventListener('click', onclick)
        }
        issueNode = temp.cloneNode(true)
        view = 'issue'

        function onclick(e) {
          currentComic.title = comicTitle
          currentComic.cover = comicCover
          currentComic.link = comicLink
          navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
        }

        if (loadIssue) loadIssue = null
      } else {
        qi('desc-read-icon').classList.remove('fa-book')
        qi('desc-read-icon').classList.add('fa-list')
        qi('desc-issue-toggle').textContent = 'Show Issues'
        let temp = descNode.cloneNode(true)
        if (!loadIssue) desc.removeChild(desc.querySelector('.issue-container'))
        desc.appendChild(descNode)
        descNode = temp.cloneNode(true)
        view = 'desc'
      }
    }

    function readingListAdd() {
      const comic = {title: comicTitle, link: comicLink, cover: comicCover}
      buildTile(new Tile(comicTitle, comicCover, comicLink), 'readinglist', true)
      writeReadingList(comic)
    }

    function readingListRemove() {
      const comic = {title: comicTitle, link: comicLink, cover: comicCover}
      q('#readinglist .carousel-inner').removeChild(document.querySelector(`img[data-link="${comicLink}"]`).parentNode)
      q('#readinglist-desc').innerHTML = ''
      deleteReadingList(comic)
    }

    bgRender(comicLink, './js/preload/description.preload.js', {'ipc-message': ipcMessage})
  } else if (page === 'comic') {
    loader('start', true)
    // Save to Recently Read database
    // Set up Home and download button
    qi('home-download').style.visibility = 'visible'

    const baseLink = currentComic.link
    const comicLink = e.link

    function ipcMessage(e) {
      if (e.channel === 'msg') {
        console.log(e.args[0])
        return
      }
      clearHidden()

      let comicPanel, comicDiv

      if (!q('#comic')) {
        comicPanel = create('div', {class: 'reader-view', id: 'comic', style: {zIndex: '2'}})
        comicDiv = create('div', {style: {width: '100%', display: 'flex', justifyContent: 'center', flexDirection: 'column'}})
        comicPanel.appendChild(comicDiv)
      } else {
        comicPanel = q('#comic')
        comicDiv = q('#comic > div')
        comicDiv.innerHTML = ''
      }
      currentComic.issue = e.args[0].nav.selectedIssue
      writeRecent(currentComic, comicLink)

      e.args[0].images.forEach( i => {
        const img = create('img', {src: i})
        comicDiv.appendChild(img)
      })
      document.body.appendChild(comicPanel)

      qi('paginate').style.display = 'flex'
      qi('search').style.display = 'none'
      qi('title').style.display = 'block'
      qi('title').textContent = currentComic.title
      const issueSelect = qi('issue-select')
      const nav = e.args[0].nav
      issueSelect.innerHTML = ''
      nav.issues.forEach( opt => {
        const option = create('option', {value: `${baseLink}/${opt.val}`, textContent: opt.txt, 'data-issue': opt.txt})
        if (opt.txt === currentComic.issue) option.selected = 'selected'
        issueSelect.add(option)
      })
      issueSelect.style.display = 'block'

      if (!nav.next) qi('nextButton').style.visibility = 'hidden'
      else {
        qi('nextButton').style.visibility = 'visible'
        nextIssue = nav.next
      }

      if (!nav.prev) qi('prevButton').style.visibility = 'hidden'
      else {
        qi('prevButton').style.visibility = 'visible'
        previousIssue = nav.prev
      }
    }

    bgRender(e.link + '&readType=1', './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
  }
}

function goNextIssue() {navigation('comic', {link: nextIssue})}
function goPrevIssue() {navigation('comic', {link: previousIssue})}
function goToIssue(e) {navigation('comic', {link: e.target.value})}

function download() {
  const downloadDB = require('./database/downloaded.database')
  if (downloadDB[currentComic.title] && downloadDB[currentComic.title][currentComic.issue]) return
  downloadComic(currentComic)
}

function bgRender(src, preload, listeners, dev) {
  // There should never be two hidden webviews
  if (qi('hidden').querySelector('webview')) return
  loaded = false
  if (!listeners['load-commit']) listeners['load-commit'] = loadCommit
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners)
  hidden.appendChild(backgroundWebview)
  if (dev) backgroundWebview.addEventListener('dom-ready', () => backgroundWebview.openDevTools())
}

// I kept forgetting to do this, so I just made a function for it
// that is easy to remember after every time I create a hidden webview
function clearHidden() {
  loaded = true
  loader('stop')
  clearInterval(iframeTO)
  iframeTO = null
  if (hidden.childNodes.length) {hidden.removeChild(q('webview'))}
}

function loader(type, dark) {
  if (type === 'start') {
    if (q('.loader')) return
    const loadScreen = dark
      ? create('div', {class: 'loader', style: {backgroundColor: 'black'}}, {'click': e => e.preventDefault()})
      : create('div', {class: 'loader'}, {'click': e => e.preventDefault()})

    const spinner = create('span', {class: ['fab', 'fa-chrome', 'fa-spin', 'fa-10x']})
    loadScreen.appendChild(spinner)
    document.body.appendChild(loadScreen)
  } else if (type === 'stop') {
    if (!q('.loader')) return
    document.body.removeChild(q('.loader'))
  }
}