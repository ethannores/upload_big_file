<template>
  <div id="app">
    <SingleUpload></SingleUpload>
    <br>
    <br>
    <br>
    <br>
    <ChunkUpload></ChunkUpload>
  </div>
</template>

<script>
import SingleUpload from "@/components/SingleUpload"
import ChunkUpload from "@/components/ChunkUpload"
export default {
  name: "App",
  components: {
    ChunkUpload,
    SingleUpload,
  },
}
</script>

<style></style>
