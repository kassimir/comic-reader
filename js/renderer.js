const Tile = require('./js/models/tile.model')
const utils = require('./js/utils.js')
const qi = utils.qi
const q = utils.q
const create = utils.create
const getIssue = utils.getOrRemoveIssue
const sortIssues = utils.sortIssues
const writeRecent = utils.writeRecent

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

const currentComic = {
  title: '',
  cover: '',
  link: '',
  issue: ''
}

// This is the database for Most Recently Read
const recentDB = require('./database/recent.database')

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
//
// qi('debug').addEventListener('click', () => {
//   hidden.style.visibility = 'visible'
//   q('html').style.height = '100%'
//   q('body').style.height = '100%'
//   q('webview').style.height = '100%'
//   hidden.style.height = '100%'
//   reader.style.display = 'none'
// })
//
// qi('opendev').addEventListener('click', () => {
//   q('webview').openDevTools()
// })
loader('start', true)

// TODO: Fix the search for only one result. If there's only one result
// TODO: the website takes you to the actual comic, which throws off my code.
function search(){
  loader('start')

  const keyword = q('#search-input').value.replace(' ', '+')

  if (q('#search-results').innerHTML) q('#search-results').innerHTML = ''

  function ipcMessage(e) {
    if (e.channel === 'end') clearHidden()

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
  // Hide the Home button, if it is showing
  if (qi('home').style.visibility === 'visible') rebuild()

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
      default: console.log(e);
    }
  }

  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})

  // Recently Read
  if (Object.keys(recentDB).length) {
    // sort recently read by date, so it displays in the appropriate order
    const sortedRecent = Object.keys(recentDB).sort( (a, b) => {
      return new Date(recentDB[b].date) - new Date(recentDB[a].date)
    })

    sortedRecent.forEach( c => {
      const comic = recentDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'recent')
    })
  }

  function rebuild() {
    loader('start', true)
    qi('home').style.visibility = 'hidden'
    document.body.removeChild(qi('comic'))
    q('#recent .carousel-inner').innerHTML = ''
    q('#recent .carousel-inner').innerHTML = ''
    q('#latest .carousel-inner').innerHTML = ''
    q('#newest .carousel-inner').innerHTML = ''
    q('#topday .carousel-inner').innerHTML = ''
    q('#topmonth .carousel-inner').innerHTML = ''
    q('#topweek .carousel-inner').innerHTML = ''
    q('#mostview .carousel-inner').innerHTML = ''
    q('#recent-desc').innerHTML = ''
    q('#recent-desc').innerHTML = ''
    q('#latest-desc').innerHTML = ''
    q('#newest-desc').innerHTML = ''
    q('#topday-desc').innerHTML = ''
    q('#topmonth-desc').innerHTML = ''
    q('#topweek-desc').innerHTML = ''
    q('#mostview-desc').innerHTML = ''
    q('#search-results').innerHTML = ''
    q('#search-desc').innerHTML = ''
  }
}

window.onload = mainRender

function buildTile(tile, section) {
  const sect = section.replace(/(tab|-)/g,'')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}}, {'click': onclick})
  const img = create('img', {'data-link': tile.link, 'data-section': sect, class: 'link', src: tile.img, style: {width: '20vw', margin: '0 2.25vw'}})
  const title = create('span', {'data-link': tile.link, 'data-section': sect, class: 'link', innerText: tile.title, style: {color: 'white', margin: '7px'}})
  if (section === 'recent') container.id = tile.title.replace(/[\s()]/g, '')

  container.appendChild(img)
  container.appendChild(title)
  comicDiv.appendChild(container)

  function onclick() {
    navigation('description', {link: tile.link, section: sect, cover: tile.img})
  }
}

// This is the function to "navigate" between pages
// in the render div
function navigation(page, e) {
  //TODO: This function is pretty huge. Make it smaller.

  // Shows the descriptiong of the selected comic
  if (page === 'description') {
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
      // I contemplated just writing everything with .innerHTML, simply because
      // there are so many elements being made, but after a lot of research, it
      // is supposed to be faster this way, so I chose it. I may update these to
      // not have inline styles. But it's hard not to utilize the amazing functionality
      // of my create function. :P

      // titleHeader is the title header. It contains the title of the comic,
      // the "Go to Comic" and "Add to Reading List", and the close button
      const titleHeader = create('div', {class: 'desc-title'})
      const title = create('p', {textContent: descArgs.title, style: {width: '34%'}})
      const optionsContainer = create('div', {'style': {display: 'flex', flexDirection: 'row', width: '33%'}, class: 'section-desc_options'})
      const descReadIcon = create('span', {class: ['fas', 'fa-list'], id: 'desc-read-icon'})
      const listIssues = create('span', {id: 'desc-issue-toggle', class: 'link', textContent: 'Show Issues'}, {'click': () => toggleView()})
      const addIcon = create('span', {class: ['fas', 'fa-plus']})
      const addToReadingList = create('span', {class: 'link', textContent: 'Add To Reading List'})
      const closeDescription = create('div', {style: {textAlign: 'right', width: '33%'}}, {'click': () => desc.innerHTML = ''})
      const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})

      optionsContainer.appendChild(addIcon)
      optionsContainer.appendChild(addToReadingList)
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

    bgRender(comicLink, './js/preload/description.preload.js', {'ipc-message': ipcMessage})
  } else if (page === 'comic') {
    loader('start', true)
    // Save to Recently Read database
    // Set up Home button
    qi('home').style.visibility = 'visible'

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
      nav.issues.forEach( opt => {
        const option = create('option', {value: `${baseLink}/${opt.val}`, textContent: opt.txt})
        if (opt.txt === currentComic.issue) option.selected = 'selected'
        issueSelect.add(option)
      })
      issueSelect.style.display = 'block'

      nextIssue = nav.next
      previousIssue = nav.prev
    }

    bgRender(e.link + '&readType=1', './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
  }
}

function goNextIssue() {navigation('comic', {link: nextIssue})}
function goPrevIssue() {navigation('comic', {link: previousIssue})}
function goToIssue(e) {navigation('comic', {link: e.target.value})}

function bgRender(src, preload, listeners) {
  // There should never be two hidden webviews
  if (qi('hidden').querySelector('webview')) return
  loaded = false
  if (!listeners['load-commit']) listeners['load-commit'] = loadCommit
  const backgroundWebview = create('webview', {src: src, preload: preload}, listeners)
  hidden.appendChild(backgroundWebview)
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