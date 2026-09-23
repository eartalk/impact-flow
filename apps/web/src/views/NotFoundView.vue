<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <section class="not-found-view">
    <span>404 / ROUTE NOT FOUND</span>
    <h1>这个页面不存在</h1>
    <p>返回回归分析工作台，继续查看代码变更需要验证的业务范围。</p>
    <button type="button" @click="router.replace('/analysis')">返回分析工作台</button>
  </section>
</template>
