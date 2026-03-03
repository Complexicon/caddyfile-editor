import { type Signal } from "@preact/signals";
import { h, Fragment, type ComponentChild, type ComponentChildren, type JSX } from 'preact';

//@ts-ignore
export let id = (t = 21) => { let e = "", r = crypto.getRandomValues(new Uint8Array(t)); for (; t--;) { let n = 63 & r[t]; e += n < 36 ? n.toString(36) : n < 62 ? (n - 26).toString(36).toUpperCase() : n < 63 ? "_" : "-" } return e };
export const sizeBytes = (bytes: number, decimals = 2) => (bytes === 0) ? '0 Bytes' : parseFloat((bytes / Math.pow(1024, Math.floor(Math.log(bytes) / Math.log(1024)))).toFixed(decimals < 0 ? 0 : decimals)) + ' ' + ['Bytes', 'KiB', 'MiB', 'GiB'][Math.floor(Math.log(bytes) / Math.log(1024))];

export const bindInput = (to: Signal) => ({ onInput: (e: JSX.TargetedInputEvent<HTMLInputElement>) => to.value = e.currentTarget.value, value: to.value });
export const bindCheckbox = (to: Signal) => ({ onInput: (e: JSX.TargetedInputEvent<HTMLInputElement>) => to.value = e.currentTarget.checked, checked: to.value });

export const Show = (props: { when: Boolean, children?: ComponentChildren }): ComponentChildren => props.when && props.children;

export function ForEach<T>(props: { of: T[], children: (value: T, index: number) => ComponentChildren }): ComponentChild {
	return (!props.of || !Array.isArray(props.of)) ? null : props.of.map((value, index) => h(Fragment, { key: index }, props.children(value, index)));
}

const JS_TO_CSS = {} as Record<string, string>;
const KEBAB_HELPER = /[A-Z]/g;
const IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;

const hash = (str: string) => [...str].reduce((p, v) => (101 * p + v.charCodeAt(0)) >>> 0, 11).toString(36);

const styleTag = document.head.appendChild(document.createElement('style'));

const classes = [] as string[];

export function css<T extends Record<string, JSX.CSSProperties>>(styling: T) {
	const transformed = Object.entries(styling).reduce((p, [className, styles]) => {
		const compiled = Object.entries(styles).map(([prop, val]) => {
			if (val === null || val === '') return;
			const name = prop[0] == '-' ? prop : (JS_TO_CSS[prop] || (JS_TO_CSS[prop] = prop.replace(KEBAB_HELPER, '-$&').toLowerCase()));
			const suffix = (typeof val === 'number' && !name.startsWith('--') && !IS_NON_DIMENSIONAL.test(name)) ? 'px;' : ';';
			return `${name}:${val}${suffix}`;
		}).join('');
		const finaClassName = `_${className.replace(KEBAB_HELPER, '-$&').toLowerCase()}__${hash(compiled)}`;
		classes.push(`.${finaClassName}{${compiled}}`);
		p[className] = finaClassName;
		return p;
	}, {} as Record<string, string>);

	styleTag.innerHTML = classes.join('');

	return transformed as Record<keyof T, string>;
}