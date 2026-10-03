// Renderer entry. Phase 2 shows the example song; the editor replaces this in Phase 3.
import 'pretendard/dist/web/variable/pretendardvariable.css'
import './preview.css'
import exampleText from '../../../examples/샴푸의요정.chord?raw'
import { DEFAULT_THEME, layout, parse } from '../../core'
import { renderPages } from './preview'

const { document: song, diagnostics } = parse(exampleText)
if (diagnostics.length > 0) console.warn('parse diagnostics', diagnostics)

const app = document.getElementById('app')
if (app) app.innerHTML = renderPages(layout(song, DEFAULT_THEME.metrics), DEFAULT_THEME)
