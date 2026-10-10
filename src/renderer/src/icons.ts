// Toolbar and menu icons: Tabler Icons (MIT), outline style, inlined so they follow the text
// colour. In the page an icon is written as <span class="icon" data-icon="folder"></span>.

import adjustmentsHorizontal from '@tabler/icons/outline/adjustments-horizontal.svg?raw'
import arrowsUpDown from '@tabler/icons/outline/arrows-up-down.svg?raw'
import bulb from '@tabler/icons/outline/bulb.svg?raw'
import chevronDown from '@tabler/icons/outline/chevron-down.svg?raw'
import chevronUp from '@tabler/icons/outline/chevron-up.svg?raw'
import clipboardText from '@tabler/icons/outline/clipboard-text.svg?raw'
import clock from '@tabler/icons/outline/clock.svg?raw'
import copy from '@tabler/icons/outline/copy.svg?raw'
import deviceFloppy from '@tabler/icons/outline/device-floppy.svg?raw'
import dots from '@tabler/icons/outline/dots.svg?raw'
import download from '@tabler/icons/outline/download.svg?raw'
import fileMusic from '@tabler/icons/outline/file-music.svg?raw'
import filePlus from '@tabler/icons/outline/file-plus.svg?raw'
import fileTypePdf from '@tabler/icons/outline/file-type-pdf.svg?raw'
import folder from '@tabler/icons/outline/folder.svg?raw'
import help from '@tabler/icons/outline/help.svg?raw'
import infoCircle from '@tabler/icons/outline/info-circle.svg?raw'
import keyboard from '@tabler/icons/outline/keyboard.svg?raw'
import layoutSidebarRight from '@tabler/icons/outline/layout-sidebar-right.svg?raw'
import pencil from '@tabler/icons/outline/pencil.svg?raw'
import playlist from '@tabler/icons/outline/playlist.svg?raw'
import presentation from '@tabler/icons/outline/presentation.svg?raw'
import refresh from '@tabler/icons/outline/refresh.svg?raw'
import replace from '@tabler/icons/outline/replace.svg?raw'
import settings from '@tabler/icons/outline/settings.svg?raw'
import share from '@tabler/icons/outline/share.svg?raw'
import userCircle from '@tabler/icons/outline/user-circle.svg?raw'

const ICONS: Record<string, string> = {
  'adjustments-horizontal': adjustmentsHorizontal,
  'arrows-up-down': arrowsUpDown,
  bulb: bulb,
  'chevron-down': chevronDown,
  'chevron-up': chevronUp,
  'clipboard-text': clipboardText,
  clock,
  copy,
  'device-floppy': deviceFloppy,
  dots: dots,
  download: download,
  'file-music': fileMusic,
  'file-plus': filePlus,
  'file-type-pdf': fileTypePdf,
  folder: folder,
  help: help,
  'info-circle': infoCircle,
  'layout-sidebar-right': layoutSidebarRight,
  keyboard,
  pencil: pencil,
  playlist: playlist,
  presentation,
  refresh,
  replace,
  settings: settings,
  share,
  'user-circle': userCircle
}

/** Fills every `[data-icon]` placeholder with its SVG. */
export function installIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const svg = ICONS[el.dataset.icon!]
    if (!svg) return
    el.innerHTML = svg.replace(/\s(width|height)="24"/g, '').replace(/\sclass="[^"]*"/, '')
    el.setAttribute('aria-hidden', 'true')
  })
}
