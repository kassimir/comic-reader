const ipcRender = require('electron').ipcRenderer
const ipcMain = require('electron').ipcMain
const fs = require('fs')

/*
  I don't want to use jQuery, but I also hate writing document.querySelector[All](element)
   a million times, so I wrote my own selector functions.
 */

const q = ele => document.querySelectorAll(ele).length > 1 ? document.querySelectorAll(ele) : document.querySelector(ele)
const qi = id => document.getElementById(id)
const qc = cls => document.getElementsByClassName(cls).length > 1 ? document.getElementsByClassName(cls) : document.getElementsByClassName(cls)[0]

/*
  I do a lot of element creation, so this shortens it.
  ele = element to create
  attrs = any attributes to add to the element in object format
    most typical style elements like {style: {width: '100px'}}
    and the id of the element
  listeners = any event listeners to add. also in object form
    example: {'console-message': (e)=>console.log(e.message)
 */

const create = (ele, attrs, listeners) => {
  // create element
  const e = document.createElement(ele)
  // add any attributes
  if (attrs) {
    // TODO: change this to Object.keys(attrs).forEach() to remove hasOwnProperty check
    for (let key in attrs) {
      if (attrs.hasOwnProperty(key)) {
        if (typeof attrs[key] === 'object' && !Array.isArray(attrs[key])) {
          for (let k in attrs[key]) {
            e[key][k] = attrs[key][k]
          }
        } else {
          if (key === 'class') {
            if (Array.isArray(attrs[key])) attrs[key].forEach( c => e.classList.add(c))
            else e.classList.add(attrs[key])
          }
          else if (key.includes('data')) e.setAttribute(key, attrs[key])
          else e[key] = attrs[key]
        }
      }
    }
  }
  // add any event listeners
  if (listeners) {
    for (let l in listeners) {
      if (listeners.hasOwnProperty(l)) e.addEventListener(l, listeners[l])
    }
  }
  return e
}

/* ipc messaging shortcuts
 There is a LOT of messaging in this app
 so I shortened it to make it less keystrokes
  msg = message to send
  channel = channel to use
  type = 'r' for ipcRender.send,
         'h' for ipcRender.sendToHost or
         else ipcMain.send()
 */
const send = (msg = '', channel = 'default', type = 'h', sync = false) => {
  if (type === 'h') ipcRender.sendToHost(channel, msg)
  else if (type === 'r' && !sync) ipcRender.send(channel, msg)
  else ipcMain.send(channel, msg)
}

// This will grab various parts of the Comic itself based off
// of the Comic issue title. For instance Deadpool (2008) Issue #69
// txt = Comic issue title text
// type = type of return:
//   'number' is easy: it only returns the last word or number in the title
//   'name' will remove 'Issue #69' and return 'Deadpool (2008)'
//   'issue' will return 'Issue #69'
// For something like 'Elseworlds: Superman TPB', both 'number' and 'issue'
// will return 'TPB'
function getOrRemoveIssue(txt, type) {
  if (!txt) return txt

  const split = txt.split(' ')
  if (split.length < 2) return txt

  function nameCheck(name) {
    // Checks the common "Issue" names. Adding new ones whenever I find them
    return ['Issue', 'Full', 'TPB', 'Special', '_Special', 'Annual', '_Annual', 'Yearbook', '_TPB'].filter( p => name.includes(p))
  }

  const last = split[split.length - 1]
  const secondLast = split[split.length - 2]

  // I haven't seen it, but if there is something titled Deadpool TPB Vol 2. This
  // will return 2 for the number and Vol 2 for the issue and Deadpool TPB for the
  // title, so something to watch out for, but until I find it, I'm not changing it. :)

  if (type === 'number') return last
  else if (type === 'issue') {
    // If the issue is a word (Full, TPB, etc) it will not parseInt
    // Same as if it has '#' in it
    if (!parseInt(last)) {
      // check if it is #[issue]
      if (last[0] === '#' || nameCheck(secondLast).length) return secondLast + ' ' + last
      // if it isn't, then it's a word of some kind (Full, TPB, etc)
      return last
    } else {
      if (nameCheck(secondLast)) return secondLast + ' ' + last
      return last
    }
  } else if (type === 'name') {
    // If it has #[issue], it's probably preceeded by "Issue"
    // I've also seen Issue [issue] without a # sign, so same scenario, really
    // Note that if something is titled Title TPB 1, it will return Title TPB
    // but I've never seen that, so . . . something to watch out for
    if ( (last[0] === '#' && nameCheck(secondLast)) || (parseInt(last) && nameCheck(secondLast)) ) return split.pop() && split.pop() && split.join(' ')
    // Just in case it isn't preceeded by "Issue" however . . .
    else if ( (last[0] === '#' && !nameCheck(secondLast))
      || (parseInt(last) && !nameCheck(secondLast))
      // Lastly, if there's an issue number but no # and no "Issue"
      || (!parseInt(last)) )
        return split.pop() && split.join(' ')
  }
}

function sortIssues(arr) {
  if (arr.length < 2) return arr

  const sortedArr = []
  // This code will find out what types of issues a comic has: Issues, TPB, Annual, etc
  // That way you don't get Issue #1, Annual 1, Issue #2. It will be Issue #1, Issue #2, Annual 1
  // Note that "Issue"s are first-class citizens here.
  const issueTypes = new Set(arr.map( i => getOrRemoveIssue(i, 'issue'))
    .map( i => {
      const ish = i.split(' ')
      return ish[0]
    }))

  // Finds all issues of a specific type and sorts them
  function mySort(a, type) {
    return a.filter( i => i.includes(type)).sort( (a,b) => {
      let first = getOrRemoveIssue(a, 'number')
      let second = getOrRemoveIssue(b, 'number')
      if (first[0] === '#') first = first.substr(1, first.length - 1)
      if (second[0] === '#') second = second.substr(1, second.length - 1)
      return first - second
    })
  }

  // Find "Issue"s first
  if (issueTypes.has('Issue')) {
    const issueArr = mySort(arr, 'Issue');

    issueArr.forEach( i => sortedArr.push(i))
  }

  // Remove "Issue"s from the array in order to loop over the remaining issue types
  issueTypes.delete('Issue')
  if (issueTypes.size) {
    issueTypes.forEach( type => {
      const issueArr = mySort(arr, type);

      issueArr.forEach( i => sortedArr.push(i))
    })
  }

  return sortedArr
}

function getGroups() {
  if (!fs.existsSync('./database/groups.database.json')) {
    fs.writeFileSync('./database/groups.database.json', '[]')
    return []
  }

  return JSON.parse(fs.readFileSync('./database/groups.database.json').toString())
}

function createGroup(sectionID, sectionTitle) {
  const groups = getGroups()
  groups.push({sectionID, sectionTitle})
  fs.writeFileSync('./database/groups.database.json', JSON.stringify(groups))
  fs.writeFileSync(`./database/${sectionID}.database.json`, `{}`)
}

function deleteGroupDB(sectionID) {
  const dbpath = `./database/${sectionID}.database.json`

  const groupsDB = getGroups()
  groupsDB.splice(groupsDB.findIndex( g => g.sectionID === sectionID), 1)
  rewriteDB('groups', groupsDB)
  fs.unlinkSync(dbpath)
}

// Writes to "database"
// TODO: utilize a model
function writeRecent(comic, link) {
  const recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())
  const l = Object.keys(recentDB).length
  if (!recentDB[comic.title]) {
    recentDB[comic.title] = {position: l, link: comic.link, cover: comic.cover, issues: {[comic.issue] : link}}
  } else {
    recentDB[comic.title].issues[comic.issue] = link
    recentDB[comic.title].position = l
  }

  if (Object.keys(recentDB).length > 30) {
    const newCurrentList = {}
    const sortedRecent = Object.keys(recentDB).sort( (a, b) => {
      return new Date(recentDB[b].position) - new Date(recentDB[a].position)
    }).splice(0, 30)

    sortedRecent.forEach( c => {
      newCurrentList[c] = recentDB[c]
    })

    send({type: 'recent', data: newCurrentList}, 'update', 'r')

  } else send({type: 'recent', data: recentDB}, 'update', 'r')
}

function readDB(db) {
  const dbpath = `./database/${db}.database.json`

  if (fs.openSync(dbpath, 'r')) return JSON.parse(fs.readFileSync(dbpath).toString())
  else return {}
}

// Writes to "database"
// Returns the length of the database for `position` purposes
function writeToDB(comic, db) {
  const dbpath = `./database/${db}.database.json`
  const fd = fs.openSync(dbpath, 'rs+')
  const database = fd ? JSON.parse(fs.readFileSync(fd).toString()) : `{}`
  const dbLength = Object.keys(database).length
  if (!database[comic.title]) {
    database[comic.title] = {position: `${dbLength + 1}`, link: comic.link, cover: comic.cover}
    fs.writeFileSync(dbpath, JSON.stringify(database))
  }

  return dbLength + 1
}

function updateDB(comic1, comic2, db) {
  const dbpath = `./database/${db}.database.json`
  const fd = fs.openSync(dbpath, 'rs+')

  if (!fd) return

  const database = JSON.parse(fs.readFileSync(fd).toString())
  database[comic1.title] = new Object(comic1)
  database[comic2.title] = new Object(comic2)
  fs.writeFileSync(fd, JSON.stringify(database))
}

// Deletes from "database"
function deleteFromDB(comic, db) {
  const dbpath = `./database/${db}.database.json`
  fs.open(dbpath, 'r', (err) => {
    if (err) {
      return
    }

    fs.readFile(dbpath, (err, f) => {
      const database = JSON.parse(f.toString())
      const dbLength = Object.keys(database).length
      if (database[comic.title]) {
        delete database[comic.title]
        const sortedReading = Object.keys(database).sort((a, b) => {
          return database[b].position - database[a].position
        })
        const newDB = {}
        sortedReading.forEach( (c, i) => {
          const n = new Object(database[c])
          n.position = dbLength - i
          newDB[c] = n
        })
        fs.writeFileSync(dbpath, JSON.stringify(newDB))
      }
    })
  })
}

// Completely rewrites "database"
function rewriteDB(db, data) {
  const dbpath = `./database/${db}.database.json`

  fs.open(dbpath, 'r', (err) => {
    if (err) return

    fs.writeFileSync(dbpath, JSON.stringify(data))
  })
}

function downloadComic(comic) {
  const downloadedDB = JSON.parse(fs.readFileSync('./database/downloaded.database.json').toString())
  const imgs = q('#comic > div').children
  const images = []

  if (!downloadedDB[comic.title]) {
    downloadedDB[comic.title] = {
      issues: [{
        issue: comic.issue,
        length: imgs.length
      }]
    }
  }

  Array.from(imgs).forEach(i => images.push(i.src))
  send({comic: comic, images: images, data: downloadedDB}, 'download', 'r')
}

module.exports = {
  q: q,
  qi: qi,
  qc: qc,
  send: send,
  create: create,
  getOrRemoveIssue: getOrRemoveIssue,
  sortIssues: sortIssues,
  getGroups: getGroups,
  createGroup: createGroup,
  deleteGroupDB: deleteGroupDB,
  writeRecent: writeRecent,
  readDB: readDB,
  rewriteDB: rewriteDB,
  writeToDB: writeToDB,
  updateDB: updateDB,
  deleteFromDB: deleteFromDB,
  downloadComic: downloadComic
}