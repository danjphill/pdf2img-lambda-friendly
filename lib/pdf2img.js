'use strict'
var IM_PATH = process.env['LAMBDA_TASK_ROOT'] + "/imagemagick/bin/";
// process.env['LD_LIBRARY_PATH'] = '/var/task/imagemagick/lib/';
process.env['PATH'] = process.env['PATH'] + ':' + IM_PATH;
// process.env['MAGICK_CONFIGURE_PATH'] = 'var/task/imagemagick/etc/ImageMagick-7';
// process.env['PREFIX'] = 'var/task/imagemagick'
// process.env['MAGICK_HOME'] = 'var/task/imagemagick'
var fs = require('fs')
var gm = require('gm').subClass({
  imageMagick: true,
  appPath: '/opt/imagemagick/bin/'
})
var gs = require('node-gs')
var path = require('path')

var options = {
  type: 'jpg',
  size: 1024,
  density: 600,
  outputdir: null,
  outputname: null,
  page: null
}

var Pdf2Img = function () {}

Pdf2Img.prototype.setOptions = function (opts) {
  options.type = opts.type || options.type
  options.size = opts.size || options.size
  options.density = opts.density || options.density
  options.outputdir = opts.outputdir || options.outputdir
  options.outputname = opts.outputname || options.outputname
  options.page = opts.page || options.page
}

Pdf2Img.prototype.convert = function (input, callbackreturn) {
  // Make sure it has correct extension
  if (path.extname(path.basename(input)) !== '.pdf') {
    return callbackreturn({
      result: 'error',
      message: 'Unsupported file type.'
    })
  }

  // Check if input file exists
  if (!isFileExists(input)) {
    return callbackreturn({
      result: 'error',
      message: 'Input file not found.'
    })
  }

  var output = path.basename(input, path.extname(path.basename(input)))

  // Set output dir
  if (options.outputdir) {
    options.outputdir = options.outputdir + path.sep
  } else {
    options.outputdir = output + path.sep
  }

  // Create output dir if it doesn't exists
  if (!isDirExists(options.outputdir)) {
    fs.mkdirSync(options.outputdir)
  }

  // Set output name
  if (options.outputname) {
    options.outputname = options.outputname
  } else {
    options.outputname = output
  }

  gm(input).identify('%p ', function (err, value) {
    if (err) {
      console.log(err)
    }
    const pageCount = String(value).split(' ').length
    if (options.page > pageCount) {
      throw new Error('Incorrect page number in options')
    }
    if (pageCount === 0) {
      throw new Error('Page number is 0')
    }
    let promises = []

    const convertOnePage = (pageNum, inputData) => {
      return new Promise((resolve, reject) => {
        var inputStream = fs.createReadStream(inputData)
        var outputFile = options.outputdir + options.outputname + '_' + pageNum + '.' + options.type

        return convertPdf2Img(inputStream, outputFile, pageNum, function (error, result) {
          if (error) {
            console.log(error)
            return reject(error)
          }

          return resolve(result)
        })
      })
    }
    for (let j = 0; j < pageCount; j++) {
      promises.push(convertOnePage(j + 1, input))
    }
    return Promise.all(promises)
      .then(result => {
        callbackreturn(null, {
          result: 'success',
          message: result
        })
      })
      .catch(e => console.log(e))
  })
}

var convertPdf2Img = function (input, output, page, callback) {
  if (input.path) {
    var filepath = input.path
  } else {
    let err = {result: 'error', message: 'Invalid input file path.'}
    return callback(err, null)
  }

  gs()
    .batch()
    .nopause()
    .option('-r' + options.density)
  // .option('-dDownScaleFactor=2')
    .option('-dFirstPage=' + page)
    .option('-dLastPage=' + page)
    .executablePath('/var/task/lambda-ghostscript/bin/./gs')
    .device('png16m')
    .output(output)
    .input(filepath)
    .exec(function (err, stdout, stderr) {
      if (err) {
        err = {
          result: 'error',
          message: err
        }
        return callback(err, null)
      }
      try {
        if (!(fs.statSync(output)['size'] / 1000)) {
          let err = {
            result: 'error',
            message: 'Zero sized output image detected.'
          }
          return callback(err, null)
        }

        var results = {
          page: page,
          name: path.basename(output),
          size: fs.statSync(output)['size'] / 1000.0,
          path: output
        }

        return callback(null, results)
      } catch (e) {
        return callback(e)
      }
    })
}

// Check if directory is exists
var isDirExists = function (path) {
  try {
    return fs.statSync(path).isDirectory()
  } catch (e) {
    return false
  }
}

// Check if file is exists
var isFileExists = function (path) {
  try {
    return fs.statSync(path).isFile()
  } catch (e) {
    return false
  }
}

module.exports = new Pdf2Img()
