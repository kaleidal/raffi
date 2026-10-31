import { mount } from 'svelte'
import '@raffi/app/app.css'
import App from "@raffi/app/src/App.svelte";
import { startTvShell } from "@raffi/app/src/lib/tv/shell";

startTvShell()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
