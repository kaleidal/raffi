import { mount } from 'svelte'
import '@raffi/app/app.css'
import App from "@raffi/app/src/App.svelte";

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
