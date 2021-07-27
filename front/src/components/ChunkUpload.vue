<template>
  <div>
    <h1>大文件切片上传</h1>
    <input type="file" @change="uploadFile" />
    <div>上传过程：<div v-html="remindText.join('&lt;br&gt;')"> </div>
    </div>
  </div>
</template>

<script>
import axios from "axios"
let server = axios.create({
  baseURL: "http://localhost:3001",
})
import SparkMD5 from "spark-md5"

export default {
  data() {
    return {
      //切片上传参数
      remainChunks: [], //剩余切片
      isStop: false, //上传暂停控制
      precent: 0, //上传进度
      uploadedChunkSize: 0, //已上传的切片数
      chunkSize: 2 * 1024 * 1024, //切片大小
      remindText: [],
      startTime: 0,
    }
  },
  methods: {
    //对文件进行切片使用 blob api的进行分隔，
    curBlob(file) {
      let chunkArr = [] //切片缓存数组
      let blobSlice =
        File.prototype.slice ||
        File.prototype.mozSlice ||
        File.prototype.webkitSlice //针对不同浏览器的分隔文件方法做处理
      let spark = new SparkMD5.ArrayBuffer() //对文件进行hash处理
      let chunkNums = Math.ceil(file.size / this.chunkSize) //切片总数

      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsArrayBuffer(file)
        reader.addEventListener("loadend", () => {
          console.log(reader.result)
          let content = reader.result
          //生成文件hash
          let hashTime = new Date().getTime()
          this.remindText.push("开始对文件生成hash")
          spark.append(content)
          const hash = spark.end()
          this.remindText.push(
            `文件哈希,哈希值为：${hash}生成完成,用时：${
              new Date().getTime() - hashTime
            } ms`
          )
          let startIndex = ""
          let endIndex = ""
          let contentItem = ""
          //对文件切割
          this.remindText.push("开始切割文件")
          let cutTime = new Date().getTime()
          for (let i = 0; i < chunkNums; i++) {
            startIndex = i * this.chunkSize
            endIndex = startIndex + this.chunkSize
            endIndex > file.size && (endIndex = file.size)

            //当前切片，从start的位置切到 end位置
            contentItem = blobSlice.call(file, startIndex, endIndex)
            chunkArr.push({
              index: i, //当前切片编号
              hash, //文件hash值
              total: chunkNums, //切片总数
              name: file.name, //文件名
              size: file.size, //文件大小
              chunk: contentItem, //当前切片文件
            })
          }
          this.remindText.push(
            `文件切割完成，文件总大小：${file.size}切割成了：${
              chunkArr.length
            }片  用时：${new Date().getTime() - cutTime} ms`
          )
          //文件切完后  resolve出去
          resolve({
            chunkArr, //所有切片数组
            fileInfo: {
              hash,
              total: chunkNums,
              name: file.name,
              size: file.size,
            },
          })
        })
        reader.addEventListener("error", err => {
          reject(err)
        })
      })
    },
    //合并切片请求
    chunkMerge(data) {
      let mergeTime = new Date().getTime()
      server({
        method: "post",
        url: "/upload/merge",
        data,
      }).then(res => {
        this.remindText.push("切片上传完成")
        this.remindText.push(
          `切片合并时间： ${
            new Date().getTime() - mergeTime
          } ms 花费总时间：${new Date().getTime() - this.startTime}ms`
        )
        this.startTime = 0

        console.log(res)
      })
    },
    //定义上传切片方法
    sendChunk(item) {
      let FD = new FormData()
      FD.append("file", item.chunk)
      FD.append("hash", item.hash)
      FD.append("name", item.name)
      FD.append("index", item.index)

      return server({
        method: "post",
        url: "/upload/chunk",
        data: FD,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: e => {
          const { loaded, total } = e
          this.uploadedChunkSize += loaded < total ? 0 : +loaded
          this.uploadedChunkSize > item.size &&
            (this.uploadedChunkSize = item.size)

          this.precent =
            ((this.uploadedChunkSize / item.size).toFixed(2) * 1000) /
            10
        },
      })
    },
    //定义异步控制并发
    sendRequest(arr, max = 6, callback) {
      let fetchArr = [] //正则执行的请求数组
      let toFetch = () => {
        if (this.isStop) {
          return Promise.reject("暂停上传")
        }

        if (!arr.length) {
          return Promise.resolve()
        }

        const chunkItem = arr.shift()
        //执行异步任务--上传分片
        const it = this.sendChunk(chunkItem)
        //如果异步任务都已经开始执行了，剩下最后彝族，则结束并发
        it.then(res => {
          //异步任务执行完成后，把该异步任务从执行数组中去除
          fetchArr.splice(fetchArr.indexOf(it), 1)
          console.log(res.data.msg)
        }).catch(err => {
          console.log(`${chunkItem.index}:任务执行失败:${err}`)
          this.isStop = true
          arr.unshift(chunkItem)
          Promise.reject(err)
        })
        //将异步任务添加进执行数组
        fetchArr.push(it)

        let p = Promise.resolve()
        //如果异步执行数组的长度大于了max，则等待其中一个异步任务执行完毕
        if (fetchArr.length >= max) {
          p = Promise.race(fetchArr)
        }
        //执行递归，去将arr中的异步任务做完
        return p.then(() => toFetch())
      }
      toFetch().then(() =>
        //当将arr中的全部执行完毕后，执行回调
        Promise.all(fetchArr)
          .then(() => {
            callback()
          })
          .catch(err => {
            console.log(err)
          })
      )
    },
    //分片上传请求
    mergeRequest() {
      const chunks = this.remainChunks
      const fileInfo = this.fileInfo
      this.remindText.push("所有切片文件上传")
      this.sendRequest(chunks, 6, () => {
        this.remindText.push(
          "切片文件上传完成，发送请求开始合并服务器的切片，并返回完整文件的url"
        )
        this.chunkMerge(fileInfo)
      })
    },
    //选择上传文件的方法
    async uploadFile(e) {
      let file = e.target.files[0]
      this.precent = 0
      this.uploadedChunkSize = 0
      this.remindText.push("触发上传")
      if (file.size < 5 * this.chunkSize) {
        this.sendFile(file)
      } else {
        //将文件分片后调用分片上传
        this.startTime = new Date().getTime()
        this.remindText.push("文件过大需要分片上传")
        const chunkInfo = await this.curBlob(file)
        this.remindText.push("文件分片上传完成")
        this.remainChunks = chunkInfo.chunkArr
        this.fileInfo = chunkInfo.fileInfo
        this.mergeRequest()
      }
    },
    //提交上传的文件
    sendFile(file) {
      let FD = new FormData()
      FD.append("file", file)
      server({
        method: "post",
        url: "/upload/file",
        data: FD,
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: progressEvent => {
          let complete =
            (((progressEvent.loaded / progressEvent.total) * 100) |
              0) +
            "%"
          console.log(complete)
        },
      }).then(res => {
        console.log(res)
      })
    },
  },
}
</script>

<style lang="scss" scoped>
</style>