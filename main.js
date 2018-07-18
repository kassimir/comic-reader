const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const ipc = require('electron').ipcMain

const path = require('path')
const url = require('url')
const fs = require('fs')
const request = require('request')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({x: -7, y: 0, width: 1200, height: 1050, autoHideMenuBar: true, titleBarStyle: 'hidden'})

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

ipc.on('update', (e, a) => {
  if (a.type === 'recent') fs.writeFileSync('./database/recent.database.json', JSON.stringify(a.data))
  else if (a.type === 'reading') fs.writeFileSync('./database/reading.database.json', JSON.stringify((a.data)))
})

ipc.on('download', (e, a) => {
  const { comic, images, data } = a
  if (!fs.existsSync('downloads')) fs.mkdirSync('downloads')
  if (!fs.existsSync(`downloads/${comic.title}`)) fs.mkdirSync(`downloads/${comic.title}`)
  if (!fs.existsSync(`downloads/${comic.title}/${comic.issue}`)) fs.mkdirSync(`downloads/${comic.title}/${comic.issue}`)
  const finishedArr = []
  images.forEach( (i, ind) => {
    const uri = i
    const filename = `downloads/${comic.title}/${comic.issue}/${ind}.jpg`
    const callback = () => {
      finishedArr.push(true)
      console.log(`finishedArr: ${finishedArr.length}`)
      if (finishedArr.length === images.length) {
        fs.writeFileSync('./database/downloaded.database.json', JSON.stringify(data))
        console.log('finished!')
      }
    }
    request.head(uri, function(err, res, body){
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
  })
})