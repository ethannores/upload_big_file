const Koa = require('koa')
const fs = require('fs')
const path = require('path')
const static = require('koa-static')
const router = require('koa-router')()
const koaBody = require('koa-body')

//定义上传文件夹
const uploadPath = path.resolve(__dirname, 'uploads')
const app = new Koa()
//定义静态资源的访问
app.use(
  static('server/upload', {
    maxAge: 30 * 24 * 3600 * 1000, //静态资源缓存时间
  })
)
//对接口的数据做格式化
app.use(
  koaBody({
    multipart: true,
    formidable: {
      uploadDir: uploadPath,
      maxFileSize: 10000 * 1024 * 1024, //设置上传文件的最大限制，不写的话默认20m
    },
  })
)
//对所有接口进行监听和做相关处理
app.use(async (ctx, next) => {
  console.log(ctx.request.method)
  //对请求接口跨域处理
  ctx.set('Access-Control-Allow-Origin', '*') //所有域都可以访问
  ctx.set(
    'Access-Control-Allow-Headers',
    'X-Requested-With,Content-Type,token'
  ) //支持分访问头部
  ctx.set(
    'Access-Control-Allow-Methods',
    'GET,POST,DELETE,PUT,OPTIONS'
  )
  ctx.set('Content-Type', 'application/json;charset=utf-8')

  if (ctx.request.method === 'OPTIONS') {
    ctx.response.status = 200
  }
  //监听往后的请求问题
  try {
    await next()
  } catch (err) {
    console.log(err, 'errMessage')
    ctx.response.status = err.statusCode || err.status || 500
    ctx.response.body = {
      code: 500,
      msg: err.message,
    }
    ctx.app.emit('error', err, ctx)
  }
})

// 单文件上传
//上传文件处理
function uploadFn(ctx, destPath) {
  return new Promise((resolve, reject) => {
    const { name, path: _path } = ctx.request.files.file
    const filePath = destPath || path.join(uploadPath, name)
    fs.rename(_path, filePath, err => {
      if (err) {
        return reject(err)
      }
      resolve(name)
    })
  })
}
//上传接口
router.post('/upload/file', async ctx => {
  await uploadFn(ctx)
    .then(name => {
      ctx.body = {
        code: 200,
        url: path.join('http://localhost:3001/uploads', name),
        msg: '文件上传成功',
      }
    })
    .catch(err => {
      ctx.body = {
        code: 500,
        msg: '文件上传失败',
        info: err,
      }
    })
})

//多文件上传---上传切片
router.post('/upload/chunk', async ctx => {
  let files = ctx.request.files
  let { index, hash } = ctx.request.body
  //切片上传目录
  const chunkPath = path.join(uploadPath, hash, '/')
  //切片目录不存在的时候，创建目录
  if (!fs.existsSync(chunkPath)) {
    fs.mkdirSync(chunkPath)
  }
  //秒传，断点续传   当当前切片已经上传，则立即返回
  //定义切片文件名
  const chunkFileName = chunkPath + hash + '-' + index
  if (fs.existsSync(chunkFileName)) {
    ctx.response.body = {
      code: 0,
      msg: `切片  ${index}  之前已经上传不用再次上传`,
    }
    console.log(tempIndex++)
    return
  } else {
    //开始上传切片
    await uploadFn(ctx, chunkFileName)
      .then(name => {
        ctx.response.body = {
          code: 0,
          msg: `切片 ${index} 上传完成`,
        }
      })
      .catch(err => {
        ctx.response.body = {
          code: -1,
          msg: `切片  ${index} 上传失败`,
          err_info: err,
        }
      })
  }
})

let tempIndex = 0
router.post('/upload/merge', async ctx => {
  const { total, hash, name } = ctx.request.body
  const dirPath = path.join(uploadPath, hash, '/') //切片的目录
  const filePath = path.join(uploadPath, name) //合成的文件
  //文件存在的话，说明文件已经上传完成
  if (fs.existsSync(filePath)) {
    fs.readdir('./uploads', (err, data) => {
      let delArr = data.filter(e => e.startsWith('upload_'))
      while (delArr.length > 0) {
        let temp = delArr.shift()
        fs.unlink(path.join(uploadPath, temp), () => {})
      }
    })
    ctx.response.body = {
      code: 0,
      msg: '文件已经上传过，不用再次上传',
      path: path.join('http://localhost:3001/uploads', name),
    }
  } else {
    //文件不存在服务器的话。则开始合并切片
    await mergeFile(dirPath, filePath, hash, total)
      .then(() => {
        //文件上传完成后，删除可能存在的以  upload_ 开头的临时文件
        fs.readdir('./uploads', (err, data) => {
          let delArr = data.filter(e => e.startsWith('upload_'))
          while (delArr.length > 0) {
            let temp = delArr.shift()
            fs.unlink(path.join(uploadPath, temp), () => {})
          }
        })
        ctx.response.body = {
          code: 0,
          msg: '文件上传完成',
          path: path.join('http://localhost:3001/uploads', name),
        }
      })
      .catch(err => {
        //文件上传完成后，删除可能存在的以  upload_ 开头的临时文件
        fs.readdir('./uploads', (err, data) => {
          let delArr = data.filter(e => e.startsWith('upload_'))
          while (delArr.length > 0) {
            let temp = delArr.shift()
            fs.unlink(path.join(uploadPath, temp), () => {})
          }
        })
        ctx.response.body = {
          code: -1,
          msg: '文件上传失败',
          err,
        }
      })
  }
})
//文件异步合并
function mergeFile(dirPath, filePath, hash, total) {
  console.log(dirPath, filePath)
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        return reject(err)
      }
      if (files.length != total || !files.length) {
        return reject('上传失败，文件切片数量不符')
      }
      //开始合并切片
      const fileWriteStream = fs.createWriteStream(filePath)

      function merge(i) {
        return new Promise((res, rej) => {
          //合并完成
          if (i === files.length) {
            fs.rmdir(dirPath, err => {
              if (err) {
                console.log(err, '删除切片文件夹失败')
              } else {
                console.log('删除切片文件夹成功')
              }
            })
            return res()
          }

          // 定义切片路径
          let chunkPath = dirPath + hash + '-' + i
          fs.readFile(chunkPath, (err, data) => {
            if (err) return rej(err)
            //将当前读取到的切片追加在存储文件
            fs.appendFile(filePath, data, () => {
              //追加到存储文件后删除，当前追加的文件
              fs.unlink(chunkPath, () => {
                //当前切片文件删除后，递归去合成下一个切片
                res(merge(i + 1))
              })
            })
          })
        })
      }
      merge(0).then(() => {
        //文件合并完成后去管理文件的可写流，有的文件不会自动关闭，例如压缩文件
        resolve(fileWriteStream.close())
      })
    })
  })
}

app.use(router.routes()) /*启动路由*/
app.use(router.allowedMethods())
app.listen(3001, function () {
  console.log('server run at 3001')
})
