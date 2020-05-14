class COMIC {
  constructor(title = '', cover = '', link = '', position = '') {
    const setValue = (key, val) => {
      if (typeof key === 'object') Object.keys(key).forEach(k => {
        const v = key[k]
        setValue(k, v)
      })
      else this[key] = val
    }

    setValue({title, cover, link, position})
  }
}

module.exports = COMIC;
// class COMIC {
//   constructor(title = '', cover = '', link = '', position = '') {
//
//   }
// }
