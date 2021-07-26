<template>
	<div id="app">
		<input type="file" @change="uploadFile" />
		<button @click="submit">上传</button>
	</div>
</template>

<script>
import axios from 'axios'
let server = axios.create({
	baseURL: 'http://localhost:3001',
})

export default {
	name: 'App',
	data() {
		return {
			tempFile: '',
		}
	},
	methods: {
		uploadFile(e) {
			this.tempFile = e.target.files[0]
		},
		submit() {
			if (!this.tempFile) {
				alert('未选择需要上传的文件，请先选择后再上传')
				return
			}
			let FD = new FormData()
			FD.append('file', this.tempFile)
			server({
				method: 'post',
				url: '/upload/file',
				data: FD,
				headers: {
					'Content-Type': 'multipart/form-data',
				},
				onUploadProgress: (progressEvent) => {
					let complete =
						(((progressEvent.loaded / progressEvent.total) * 100) |
							0) +
						'%'
					console.log(complete)
				},
			}).then((res) => {
				console.log(res)
			})
		},
	},
}
</script>

<style></style>
