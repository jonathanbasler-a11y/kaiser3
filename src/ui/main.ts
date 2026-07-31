import { mount } from './app.ts'

const container = document.getElementById('app')
if (!container) throw new Error('#app not found')
mount(container)
