const fs = require('fs')
const send = require('./utils').send

// opts:
//   type: array or object
//   createNew: bool => creates new if db doesn't exist
//   returnNew: bool => returns "blank" if nothing found
function getDB(db, opts = {type: 'obj', createNew: true, returnNew: true}) {
  const dbPath = `./database/${db}.database.json`
  const newVal = opts.type === 'obj' ? {} : []
  if (!fs.existsSync(dbPath)) {
    if (opts.createNew) fs.writeFileSync(dbPath, newVal)
    if (opts.returnNew) return newVal
  } else return JSON.parse(fs.readFileSync(dbPath).toString())
}

function createGroup(sectionID, sectionTitle) {
  const groups = getDB('groups', {type: 'arr'})
  groups.push({sectionID, sectionTitle})
  rewriteDB('groups', groups)
  fs.writeFileSync(`./database/${sectionID}.database.json`, `{}`)
}

function deleteGroupDB(sectionID) {
  const dbpath = `./database/${sectionID}.database.json`

  const groupsDB = getDB('groups', {type: 'arr'})
  groupsDB.splice(groupsDB.findIndex( g => g.sectionID === sectionID), 1)
  fs.unlinkSync(dbpath)
  rewriteDB('groups', groupsDB)
}

function createIssueList(db) {
  const lists = getDB('lists', {type: 'arr'})
  lists.push(db)
  rewriteDB('lists', lists)
  fs.writeFileSync(`./database/${db}.database.json`, `[]`)
}

function addIssuesToListDB(db, title, issue, link, cover) {
  const ilist = getDB(db, {type: 'arr', createNew: false})
  const position = ilist.length
  ilist.push({title, cover, issue, link, position})
  rewriteDB(db, ilist)
}

function moveListIssues(db, drag, drop) {
  if (drag === drop) return
  drag = +drag
  drop = +drop
  const list = getDB(db, {type: 'arr', createNew: false})
  if (drag < drop) { // moved down list
    list.forEach( (l, ind) => {
      if (ind < drag || ind > drop) return
      else if (ind === drag) l.position = drop
      else --l.position
    })
  } else {
    drop++
    list.forEach( (l, ind) => {
      if (ind < drop || ind > drag) return
      else if (ind === drag) l.position = drop
      else ++l.position
    })
  }

  const newList = list.map( (_, i) => list.find(l => l.position === i))
  rewriteDB(db, newList)
}

function deleteListIssue(db, title, issue) {
  const issues = getDB(db, {type: 'arr'})

  const index = issues.findIndex( i => i.title === title && i.issue === issue)
  issues.splice(index, 1)

  const newList = issues.map( (i, ind) => {
    if (i.position !== ind) i.position = ind
    return i
  })
  rewriteDB(db, JSON.stringify(newList))
}

function deleteListFromDB(db) {
  const issueslist = getDB('lists')
  const index = issueslist.findIndex(i => i === db)
  issueslist.splice(index, 1)
  fs.unlinkSync(`./database/${db}.database.json`)
  rewriteDB('lists', issueslist)
}

// Writes to recent "database"
// TODO: utilize a model
function writeRecent(comic, link) {
  // Older version of app didn't put these into the LIST database,
  // and this will keep from fucking over the Recent section
  if (!comic.cover || !comic.link) return

  const recentDB = JSON.parse(fs.readFileSync('./database/recent.database.json').toString())
  const l = Object.keys(recentDB).length
  if (!recentDB[comic.title]) {
    recentDB[comic.title] = {position: l, link: comic.link, cover: comic.cover, issues: {[comic.issue]: link}}
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
    rewriteDB('recent', newCurrentList)
  } else rewriteDB('recent', recentDB)
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
  const fd = fs.openSync(dbpath, 'r+')

  if (!fd) return

  if (typeof data !== 'string') data = JSON.stringify(data)
  fs.writeFileSync(dbpath, data)
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
  getDB: getDB,
  readDB: readDB,
  writeToDB: writeToDB,
  rewriteDB: rewriteDB,
  updateDB: updateDB,
  deleteFromDB: deleteFromDB,
  createGroup: createGroup,
  deleteGroupDB: deleteGroupDB,
  createIssueList: createIssueList,
  addIssuesToListDB: addIssuesToListDB,
  moveListIssues: moveListIssues,
  deleteListIssue: deleteListIssue,
  deleteListFromDB: deleteListFromDB,
  writeRecent: writeRecent,
  downloadComic: downloadComic
}