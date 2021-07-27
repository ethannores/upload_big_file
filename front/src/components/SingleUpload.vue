<template>
  <div>
    <h1>大文件单独上传</h1>
    <input type="file" @change="uploadFile" />
    <button @click="submit">上传</button>
    <div>上传进度：{{uploadProcess}} 完成时间：{{complateTime}} ms</div>
  </div>
</template>

<script>
import axios from "axios"
let server = axios.create({
  baseURL: "http://localhost:3001",
})

export default {
  data() {
    return {
      tempFile: "",
      uploadProcess: "",
      complateTime: 0,
      //切片上传参数
    }
  },
  methods: {
    //上传文件
    uploadFile(e) {
      this.tempFile = e.target.files[0]
    },
    //提交上传的文件
    submit() {
      if (!this.tempFile) {
        alert("未选择需要上传的文件，请先选择后再上传")
        return
      }
      let FD = new FormData()
      FD.append("file", this.tempFile)
      let startTime = new Date().getTime()
      server({
        method: "post",
        url: "/upload/file",
        data: FD,
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: progressEvent => {
          this.uploadProcess =
            (((progressEvent.loaded / progressEvent.total) * 100) |
              0) +
            "%"
          if (progressEvent.loaded == progressEvent.total) {
            let endTime = new Date().getTime()
            this.complateTime = endTime - startTime
          }
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