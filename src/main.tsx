import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import '@/lib/i18n'
import './index.css'
import { router } from './app/router'
import { warmUpSpeech } from '@/lib/speech'

warmUpSpeech()
// v1.4 までの学習カードを、確かめられたものから FSRS-7 へ（裏で自動。操作は不要）
void import('@/features/study/migrate').then((m) => m.scheduleMigration())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
