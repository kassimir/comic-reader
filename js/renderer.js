const utils = require('./js/utils.js')
const qi = utils.qi
const q = utils.q
const qc = utils.qc
const create = utils.create
const Tile = require('./js/models/tile.model')
const fs = require('fs')

const ipc = require('electron').ipcRenderer

// Hidden div for rendering pages in the background
const hidden = qi('hidden')
// Reader div for actually displaying data
const reader = qi('reader')
// Variable for the loader failsafe (failLoad)
let loaderLoading, loaderTimeout

if (!navigator.onLine) {
  // Go to download mode
  q('.section-title').forEach(i => i.style.display = 'none')
  q('.carousel-outer').forEach(i => i.style.display = 'none')
  q('.downloaded').forEach(i => i.style.display = 'block')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  Object.keys(downloadedDB).forEach(key => {
    buildTile(new Tile(key, `downloads/${key}/cover.jpg`, null), `downloaded`)
  })
} else {
  loader('start', true)
  window.onload = mainRender
}

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

let recentDB, readingDB

// This is the database for the Reading List
if (fs.existsSync('./database/reading.database.json')) readingDB = JSON.parse(fs.readFileSync('./database/reading.database.json').toString())
else {
  if (!fs.existsSync('./database')) fs.mkdirSync('./database')
  fs.writeFileSync('./database/reading.database.json', '{}', {flag: 'w'})
  readingDB = {}
}

// This is the database for Most Recently Read
if (fs.existsSync('./database/recent.database.json')) recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())
else {
  if (!fs.existsSync('./database')) fs.mkdirSync('./database')
  fs.writeFileSync('./database/recent.database.json', '{}', {flag: 'w'})
  recentDB = {}
}

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
    } else clearInterval(iframeTO)
  }, 2000)
}

function search() {
  loader('start', false)

  const keyword = q('#search-input').value.replace(' ', '+')

  if (q('#search-results').innerHTML) q('#search-results').innerHTML = ''
  const closeSearchDiv = create('div', {
    style: {
      textAlign: 'right',
      paddingRight: '20px',
      backgroundColor: '#5E051D',
      visibility: 'hidden'
    }
  })
  const closeSeachButton = create('span', {class: 'link', textContent: 'X'}, {
    'click': () => {
      q('#search-results').innerHTML = ''
      q('#search-desc').innerHTML = ''
    }
  })
  closeSearchDiv.appendChild(closeSeachButton)
  q('#search-results').appendChild(closeSearchDiv)

  function ipcMessage(e) {
    if (e.channel === 'end') {
      closeSearchDiv.style.visibility = 'visible'
      clearHidden()
      return
    } else if (e.channel === 'msg') {
      console.log(e.args[0])
      clearHidden()
      return
    } else if (e.channel === 'desc') {
      console.log('got desc')
      clearHidden()
      navigation('description', {link: e.args[0].link, cover: e.args[0].cover, section: 'search', view: 'd'})
      return
    }
    const comic = e.args[0]

    if (!comic.link || !comic.title || !comic.issues) return

    const searchDiv = q('#search-results')

    const resultDiv = create('div', {class: 'search-table'})
    const icon = create('span', {class: ['fas', 'fa-info-circle']}, {
      'click': () => navigation('description', {
        section: 'search',
        link: comic.link
      })
    })
    const titleSpan = create('span', {
      textContent: comic.title,
      style: {marginLeft: '10px'}
    }, {'click': () => navigation('description', {section: 'search', link: comic.link, view: 'i'})})
    const titleDiv = create('div')
    const issueSpan = create('span', {textContent: comic.issues}, {
      'click': () => navigation('description', {
        section: 'search',
        link: comic.link,
        view: 'i'
      })
    })

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

  readingDB = JSON.parse(fs.readFileSync('./database/reading.database.json').toString())
  recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())

  // Hide the Home and download button, if it is showing
  if (qi('home-download').style.visibility === 'visible') rebuild()

  function ipcMessage(e) {
    switch (e.channel) {
      case 'msg':
        console.log(e.args[0]);
        break
      case 'tab-newest':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-day':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-week':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-top-month':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'tab-mostview':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'latest':
        buildTile(new Tile(e.args[0].title, e.args[0].img, e.args[0].link), e.channel);
        break
      case 'end':
        clearHidden();
        break
      // default: console.log(e.args[0]);
      default:
        break;
    }
  }

  bgRender('http://readcomiconline.to', 'js/preload/tops.preload.js', {'ipc-message': ipcMessage})

  // Recently Read
  if (Object.keys(recentDB).length) {
    qi('recent').style.display = 'block'
    // sort recently read by date, so it displays in the appropriate order
    const sortedRecent = Object.keys(recentDB).sort((a, b) => {
      return new Date(recentDB[b].date) - new Date(recentDB[a].date)
    })

    sortedRecent.forEach(c => {
      const comic = recentDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'recent')
    })
  } else qi('recent-text').style.display = 'none'

  // Reading List
  if (Object.keys(readingDB).length) {
    qi('recent-text').style.display = 'block'
    qi('readinglist').style.display = 'block'
    const sortedReading = Object.keys(readingDB).sort((a, b) => {
      return new Date(readingDB[b].date) - new Date(readingDB[a].date)
    })

    sortedReading.forEach(c => {
      const comic = readingDB[c]
      buildTile(new Tile(c, comic.cover, comic.link), 'readinglist')
    })
  } else {
    qi('readinglist').style.display = 'none'
    qi('reading-text').style.display = 'none'
  }

  function rebuild() {
    loader('start', true)
    qi('home-download').style.visibility = 'hidden'
    if (qi('comic')) document.body.removeChild(qi('comic'))
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
  const sect = section.replace(/(tab|-)/g, '')
  const comicDiv = qi(`${sect}`).querySelector('.carousel-inner')

  const container = create('div', {style: {display: 'flex', 'flex-direction': 'column'}})
  const img = create('img',
    {
      'data-link': tile.link,
      'data-section': sect,
      class: 'link',
      src: tile.img,
      style: {width: '20vw', margin: '0 2.25vw'}
    },
    {
      'error': onerr,
      'click': () => navigation('description', {link: tile.link, section: sect, cover: tile.img, view: 'i'})
    }
  )
  const title = create('span',
    {
      'data-link': tile.link,
      'data-section': sect,
      class: 'link',
      innerText: tile.title,
      style: {color: 'white', margin: '7px'}
    },
    {'click': () => navigation('description', {link: tile.link, section: sect, cover: tile.img, view: 'd'})}
  )
  if (section === 'recent') container.id = tile.title.replace(/[\s()]/g, '')

  container.appendChild(img)
  container.appendChild(title)
  if (first) {
    comicDiv.insertBefore(container, comicDiv.children[0])
  } else {
    comicDiv.appendChild(container)
  }

  // The page will often send 503 errors for the images, so
  // this will keep trying to load it until it doesn't error
  // Obviously, there's no failsafe here, so if there's a
  // legitimate error (like a 404), it will try into oblivion
  // TODO: Set a default image after x amount of tries
  function onerr(e) {
    setTimeout(() => e.target.src = e.target.currentSrc, 2000)
  }
}

// This is the function to "navigate" between pages
// in the render div
// e: link, section, cover
function navigation(page, e) {
  // Shows the description of the selected comic
  if (page === 'description') buildDescription(e)
  // Load the comic
  else buildComic(e)
}

function buildDescription(e) {
  loader('start', false, 10)

  const descId = `${e.section}-desc`
  const comicLink = e.link
  const issueFragment = document.createDocumentFragment()
  const descFragment = document.createDocumentFragment()
  const view = e.view ? e.view : 'i'

  let desc, comicTitle
  let comicCover = e.cover

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
    // Title of the comic
    const title = create('p', {textContent: descArgs.title, style: {width: '34%'}})
    // Contains 'Add to/Remove from Reading List' and 'Show Issues/Description'
    const optionsContainer = create('div', {
      'style': {display: 'flex', flexDirection: 'row', width: '33%'},
      class: 'section-desc_options'
    })
    // Icon for 'Show Issues'
    const descReadIcon = create('span', {class: ['fas', 'fa-list'], id: 'desc-read-icon', style: {display: 'block'}})
    // Span: 'Show Issues'
    const listIssues = create('span', {
      class: ['desc-show-issues', 'link'],
      textContent: 'Show Issues'
    }, {'click': () => toggleView('i')})
    // Icon for 'Show Description'
    const descIssuesIcon = create('span', {
      class: ['fas', 'fa-book'],
      id: 'issues-icon',
      style: {marginLeft: '10px', display: 'block'}
    })
    // Span: 'Show Description'
    const showDescription = create('span', {
      class: ['issues-show-desc', 'link'],
      textContent: 'Show Description'
    }, {'click': () => toggleView('d')})
    // Icon for 'Add To Reading List'
    const addIcon = create('span', {class: ['fas', 'fa-plus']})
    // Span: 'Add To Reading List'
    const addToReadingList = create('span', {class: 'link', textContent: 'Add To Reading List'}, {'click': addReading})
    // Icon for 'Remove From Reading List'
    const removeIcon = create('span', {class: ['fas', 'fa-minus']})
    // Span: 'Remove From Reading List'
    const removeFromReadingList = create('span', {
      class: 'link',
      textContent: 'Remove From Reading List'
    }, {'click': removeReading})
    // Div to house the 'X' to close description/issues
    const closeDescription = create('div', {
      style: {
        textAlign: 'right',
        width: '33%'
      }
    }, {'click': () => desc.innerHTML = ''})
    // 'X' to close description/issues
    const closeDesc = create('span', {class: 'link', textContent: 'x', style: {marginRight: '20px'}})
    // Decides whether to add Add or Remove to/from Reading List icons
    if (descId !== 'readinglist-desc') {
      if (readingDB[comicTitle]) {
        optionsContainer.appendChild(removeIcon)
        optionsContainer.appendChild(removeFromReadingList)
      } else {
        optionsContainer.appendChild(addIcon)
        optionsContainer.appendChild(addToReadingList)
      }
    } else {
      optionsContainer.appendChild(removeIcon)
      optionsContainer.appendChild(removeFromReadingList)
    }

    optionsContainer.appendChild(descReadIcon)
    optionsContainer.appendChild(descIssuesIcon)
    optionsContainer.appendChild(listIssues)
    optionsContainer.appendChild(showDescription)
    closeDescription.appendChild(closeDesc)
    titleHeader.appendChild(optionsContainer)
    titleHeader.appendChild(title)
    titleHeader.appendChild(closeDescription)

    // Description
    const descContainer = create('div', {class: 'desc-info'})
    const info = create('div', {style: {width: '35%', display: 'flex', flexDirection: 'column'}})
    const genre = create('p', {
      textContent: `${descArgs.genres.length > 1 ? 'Genres' : 'Genre'}: ${descArgs.genres.join(', ')}`,
      fontWeight: 'bold'
    })
    const writer = create('p', {
      textContent: `${descArgs.writer.length > 1 ? 'Writers' : 'Writer'}: ${descArgs.writer.join(', ')}`,
      fontWeight: 'bold'
    })
    const artist = create('p', {
      textContent: `${descArgs.artist.length > 1 ? 'Artists' : 'Artist'}: ${descArgs.artist.join(', ')}`,
      fontWeight: 'bold'
    })
    const publisher = create('p', {
      textContent: `${descArgs.publisher.length > 1 ? 'Publishers' : 'Publisher'}: ${descArgs.publisher.join(', ')}`,
      fontWeight: 'bold'
    })
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

    sortedIssuesArray.forEach(i => {
      let spanClass = 'link'
      if (recentDB[comicTitle] && recentDB[comicTitle].issues[getIssue(i, 'issue')]) spanClass = 'link-read'
      const a = create('span', {textContent: i, 'data-link': ishArgs[i], class: spanClass})
      issueContainer.appendChild(a)
    })

    issueFragment.appendChild(issueContainer)
    issueNode = issueFragment.cloneNode(true)

    desc.appendChild(issueFragment)

    if (q('.issue-container span').length) {
      q('.issue-container span').forEach(i => i.addEventListener('click', onclick))
    } else {
      q('.issue-container span').addEventListener('click', onclick)
    }

    toggleView(view)

    function onclick(e) {
      currentComic.title = comicTitle
      currentComic.cover = comicCover
      currentComic.link = comicLink
      navigation('comic', {title: comicTitle, issue: e.target.textContent, link: e.target.dataset.link})
    }

    function toggleView(v) {
      if (v === 'i') {
        descContainer.style.display = 'none'
        descReadIcon.style.display = 'none'
        listIssues.style.display = 'none'

        issueContainer.style.display = 'block'
        descIssuesIcon.style.display = 'block'
        showDescription.style.display = 'block'
      } else {
        descContainer.style.display = 'flex'
        descReadIcon.style.display = 'block'
        listIssues.style.display = 'block'

        issueContainer.style.display = 'none'
        descIssuesIcon.style.display = 'none'
        showDescription.style.display = 'none'
      }
    }

    function addReading() {
      const icon = descReadIcon.style.display === 'none' ? descIssuesIcon : descReadIcon
      optionsContainer.removeChild(addIcon)
      optionsContainer.removeChild(addToReadingList)
      optionsContainer.insertBefore(removeFromReadingList, icon)
      optionsContainer.insertBefore(removeIcon, removeFromReadingList)
      readingListAdd()
    }

    function removeReading() {
      const icon = descReadIcon.style.display === 'none' ? descIssuesIcon : descReadIcon
      optionsContainer.removeChild(removeIcon)
      optionsContainer.removeChild(removeFromReadingList)
      optionsContainer.insertBefore(addToReadingList, icon)
      optionsContainer.insertBefore(addIcon, addToReadingList)
      readingListRemove()
    }
  }

  function readingListAdd() {
    console.log(qi('readinglist').style.display)
    if (qi('reading-text').style.display === 'none') qi('reading-text').style.display = 'block'
    if (qi('readinglist').style.display === 'none') qi('readinglist').style.display = 'block'
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
}

function buildComic(e) {
  loader('start', false, 300)
  // Save to Recently Read database
  // Set up Home and download button

  qi('home-download').style.visibility = 'visible'

  // TODO: This will show/hide the download button based on the downloaded database
  // TODO: Unfortunately it doesn't take into account locally deleting the files, since
  // TODO: I don't have an offline / downloaded reader built yet.
  // TODO: So I'm commenting it out for now.
  // let downloadedDB
  //
  // if (fs.existsSync('./database/downloaded.database.json')) {
  //   downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  // } else {
  //   fs.writeFile('./database/downloaded.database.json', '{}')
  //   downloadedDB = {}
  // }
  // if (
  //   downloadedDB[currentComic.title] && downloadedDB[currentComic.title].issues.find(i => i.issue === getIssue(e.issue, 'issue')))
  // ) qi('download').style.visibility = 'hidden'

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
      comicDiv = create('div', {
        style: {
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexDirection: 'column'
        }
      })
      comicPanel.appendChild(comicDiv)
    } else {
      comicPanel = q('#comic')
      comicDiv = q('#comic > div')
      comicDiv.innerHTML = ''
    }
    currentComic.issue = e.args[0].nav.selectedIssue
    writeRecent(currentComic, comicLink)

    e.args[0].images.forEach(i => {
      const img = create('img', {src: i, style: {width: '100%', height: 'auto'}}, {'mousedown': rightClickImage})
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
    nav.issues.forEach(opt => {
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

    function rightClickImage(e) {
      const menu = qi('rotate-menu')
      if (menu) q('body').removeChild(menu)

      if (e.which === 3) rightClickMenu({target: e.target, x: e.clientX, y: e.clientY})
    }
  }

  bgRender(e.link + '&readType=1', './js/preload/comic.preload.js', {'ipc-message': ipcMessage})
}

function rightClickMenu(coords = {target: null, x: 0, y: 0}) {
  const { target, x, y } = coords
  const div = create('div', {
    style: {
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width: '85px',
      height: '38px',
      backgroundColor: 'white',
      border: '1px solid black',
      color: 'black',
      display: 'flex',
      flexDirection: 'column',
      zIndex: '3',
      textAlign: 'center'
    },
    id: 'rotate-menu'
  })
  const left = create('p', {class: 'link',
    style: {
      width: '100%',
      height: '18px',
      borderBottom: '1px solid black',
      fontSize: '12px',
      margin: 0
    }}, {'click': () => rotate('l')})
  const right = create('p', {class: 'link',
    style: {
      width: '100%',
      height: '18px',
      fontSize: '12px',
      margin: 0,
      paddingTop: '1px'
  }}, {'click': () => rotate('r')})
  left.innerText = 'Rotate Left'
  right.innerText = 'Rotate Right'
  div.appendChild(left)
  div.appendChild(right)
  q('body').appendChild(div)

  function rotate(dir) {
    const s = target.style
    let rotateAmount

    const alreadyRotated = !!s.transform.match(/deg/)
    if (!alreadyRotated && dir === 'r') rotateAmount = 90
    else if (!alreadyRotated && dir === 'l') rotateAmount = 270
    else {
      let currentRotation = +s.transform.slice(7, 9)
      if (currentRotation !== 90) currentRotation = currentRotation * 10
      if (dir === 'l') rotateAmount = currentRotation - 90 <= 0 ? 0 : currentRotation - 90
      else rotateAmount = currentRotation + 90 >= 360 ? 0 : currentRotation + 90
    }

    if (!checkAngles(rotateAmount)) rotateAmount = 0
    s.transform = rotateAmount ? 'rotate(' + rotateAmount + 'deg)' : ''


    if (rotateAmount === 90 || rotateAmount === 270) {
      if (target.offsetHeight >= window.innerWidth) {
        s.width = 'auto'
        s.height = window.innerWidth + 'px'
      }
    } else {
      console.log('elsing')
      s.width = '100%'
      s.height = 'auto'
    }

  }

  function checkAngles(r) {
    return r === 0 || r === 90 || r === 270 || r === 180
  }
}

function goNextIssue() {
  navigation('comic', {link: nextIssue})
}

function goPrevIssue() {
  navigation('comic', {link: previousIssue})
}

function goToIssue(e) {
  navigation('comic', {link: e.target.value})
}

function download() {
  loader('start')
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  if (downloadedDB[currentComic.title] && downloadedDB[currentComic.title][currentComic.issue]) return
  downloadComic(currentComic)
}

ipc.on('download', (e, a) => {
  loader('stop')
});

function bgRender(src, preload, listeners, dev = false) {
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
  if (hidden.childNodes.length) {
    hidden.removeChild(q('webview'))
  }
}

function loader(type, dark = false, time = 30) {
  time = time * 1000

  loaderTimeout = l => {
    setTimeout(function() {
      if (l) {
        loader('stop')
        failLoad()
      }
    }, time)
  }

  loaderTimeout()

  function failLoad() {
    const body = q('body')
    const div = create('div', {
      id: 'load-error',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'black',
        zIndex: 999,
        color: 'white',
        textAlign: 'center',
        padding: '20px'
      }
    })
    const p = create('p', {style: {display: 'inline', marginRight: '20px'}})
    p.innerText = 'Error with that request.'
    const button = create('button', {type: 'text', style: {display: 'inline'}}, {
      'click': () => {
        console.log('clicking button')
        loader('start', true)
        if (qi('hidden')) qi('hidden').removeChild(qi('hidden').querySelector('webview'))
        mainRender()
        body.removeChild(div)
      }
    })
    button.innerText = 'Reload'
    body.appendChild(div)
    div.appendChild(p)
    div.appendChild(button)
  }
  if (type === 'start') {
    loaderLoading = true
    if (q('.loader')) return
    const loadScreen = dark
      ? create('div', {class: 'loader', style: {backgroundColor: 'black'}}, {'click': e => e.preventDefault()})
      : create('div', {class: 'loader'}, {'click': e => e.preventDefault()})

    const spinner = create('span', {class: ['fab', 'fa-chrome', 'fa-spin', 'fa-10x']})
    loadScreen.appendChild(spinner)
    document.body.appendChild(loadScreen)
  } else if (type === 'stop') {
    loaderLoading = false
    clearTimeout.call(this, loaderTimeout)
    if (!q('.loader')) return
    document.body.removeChild(q('.loader'))
  }
}
