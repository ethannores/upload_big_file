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
	ctx.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,PUT,OPTIONS')
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
//上传文件处理
function uploadFn(ctx, destPath) {
	return new Promise((resolve, reject) => {
		const { name, path: _path } = ctx.request.files.file
		const filePath = destPath || path.join(uploadPath, name)
		fs.rename(_path, filePath, (err) => {
			if (err) {
				return reject(err)
			}
			resolve(name)
		})
	})
}
//上传接口
router.post('/upload/file', async (ctx) => {
	await uploadFn(ctx)
		.then((name) => {
			ctx.body = {
				code: 200,
				url: path.join('http://localhost:3001/uploads', name),
				msg: '文件上传成功',
			}
		})
		.catch((err) => {
			ctx.body = {
				code: 500,
				msg: '文件上传失败',
				info: err,
			}
		})
})

app.use(router.routes()) /*启动路由*/
app.use(router.allowedMethods())
app.listen(3001, function () {
	console.log('server run at 3001')
})
