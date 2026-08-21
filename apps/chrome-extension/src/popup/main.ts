import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Popup mount element was not found')

mount(App, { target })
