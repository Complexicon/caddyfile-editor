import { signal, useSignal, type ReadonlySignal } from "@preact/signals";
import { h } from 'preact'

type Preference = 'light' | 'dark'

export const preference = () => localStorage.getItem('theme') as Preference || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');

const writableSignal = signal(preference());
export const preferenceSignal: ReadonlySignal<Preference> = writableSignal;

export function setPreference(theme: Preference) {
	localStorage.setItem('theme', theme);
	document.body.setAttribute('data-bs-theme', theme);
	writableSignal.value = theme;
}

export function ThemeToggle() {

	const dark = useSignal(preference() === 'dark');

	function toggle() {
		setPreference(dark.value ? 'light' : 'dark');
		dark.value = preference() === 'dark';
	}

	return h('button', { class: "bg-transparent border-0", onClick: toggle }, h('i', { class: `square fa-solid fa-${dark.value ? 'moon' : 'sun'}`, title: 'Toggle Theme' }, null));
}

setPreference(preference());