---
aside: false
outline: false
---

<script setup>
import { useRoute } from 'vitepress';
const route = useRoute();
const operationId = route.data.params.operationId;
</script>

<OAOperation :operationId="operationId" />
