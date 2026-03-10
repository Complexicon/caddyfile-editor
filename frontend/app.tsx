import type { App } from '@/gotypes';
import Client from '@/spark/client';
import '@/spark/debug';
import '@fortawesome/fontawesome-free/css/all.css';
import { computed, signal, useSignal } from '@preact/signals';
import 'bootstrap/dist/css/bootstrap.css';
import { editor, type MarkerSeverity } from 'monaco-editor';
import { render } from 'preact';
import { installCaddyfileLang } from './caddyfile-lang';
import { monaco, Monaco } from './components/Monaco';
import { preferenceSignal, ThemeToggle } from './spark/themes';
import { css } from './spark/util';
import { useEffect, useRef } from 'preact/hooks';

export const client = Client<App>('/rpc/')

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

const styling = css({
	toolRibbon: {
		top: '2em',
		right: '10em',
		zIndex: 10,
	},
	toolRibbonMobile: {
		zIndex: 10,
		left: '50%',
		transform: 'translateX(-50%)',
		bottom: '2em',
	}
});

function debounce<T>(func: T, timeout = 300): T {
	let timer: number;
	//@ts-ignore
	return (...args) => {
		clearTimeout(timer);
		//@ts-ignore
		timer = setTimeout(() => func(...args), timeout);
	};
}

const lastError = signal<string | undefined>('EOF');
const validCaddyfileConfig = computed(() => !Boolean(lastError.value));

async function validateCaddyfile(content: string, editor: editor.IStandaloneCodeEditor) {
	const result = await client.AdaptCaddyfile(content);

	const markers = [] as editor.IMarkerData[];

	for (const warning of result.Warnings ?? []) {
		markers.push({
			startLineNumber: warning.line!,
			endLineNumber: warning.directive === 'HACK_WHOLEFILE' ? (editor.getModel()?.getLineCount() ?? 0) + 1 :  warning.line! + 1,
			severity: 4 as MarkerSeverity.Warning,
			message: warning.message!,
			startColumn: 0,
			endColumn: 0
		})
	}

	if (result.AdaptError) {
		markers.push({
			severity: 8 as MarkerSeverity.Error,
			message: result.AdaptError,
			startLineNumber: 0,
			startColumn: 0,
			endLineNumber: (editor.getModel()?.getLineCount() ?? 0) + 1,
			endColumn: 0
		});
		lastError.value = result.AdaptError;
	} else {
		lastError.value = undefined;
	}

	monaco.editor.setModelMarkers(editor.getModel()!, "owner", markers);
}

const debouncedValidator = debounce(validateCaddyfile, 600);

function downloadFile(textContent: string) {
	const blob = new Blob([textContent], { type: 'text/caddyfile' });
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = 'Caddyfile';
	link.click();
}

async function handleCaddyfileImport() {
	return await new Promise<string | null>(resolve => {
		const input = document.createElement('input');
		input.type = 'file';
		input.click();
		input.addEventListener('change', e => {
			const target = e.target as HTMLInputElement;
			const file = target.files![0];

			if (file) {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => resolve(null);
				reader.readAsText(file);
			} else {
				resolve(null);
			}
		});
		input.addEventListener('cancel', () => resolve(null));
	});
}

function App() {

	const currentConfig = useSignal('');
	const initContent = useSignal('');
	const editor = useRef<editor.IStandaloneCodeEditor>();

	useEffect(() => {
		client.LastCaddyfile().then(v => initContent.value = v).catch(() => void(0));
	}, []);

	function saveConfig(caddyfile: string) {
		if(confirm('save configuration and reload caddy?')) {
			client.InstallCaddyfile(caddyfile)
			.then(() => client.LastCaddyfile().then(v => editor.current?.setValue(v)).catch(() => void(0)))
			.catch(alert);
		}
	}

	return (
		<div class="d-flex h-100 justify-content-center align-items-center flex-column">
			<div class="d-flex h-100 w-100 position-relative">
				<Monaco
					onChange={(c, e) => {
						lastError.value = 'Waiting for Validation...';
						currentConfig.value = c;
						debouncedValidator(c, e);
					}}
					initContent={initContent.value}
					bootstrap={(editorInst, monaco) => {
						editor.current = editorInst;
						installCaddyfileLang(editorInst, monaco);
						// install little ctrl+s convenience helper
						editorInst.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveConfig(currentConfig.value));
					}}
					language='caddyfile'
					theme={preferenceSignal.value === 'dark' ? 'vs-dark' : 'vs'}
				/>
				<div class={`d-inline-flex gap-2 border shadow position-absolute align-items-center bg-${preferenceSignal.value} p-2 rounded ${isMobileDevice() ? styling.toolRibbonMobile : styling.toolRibbon}`}>
					<button disabled={!validCaddyfileConfig.value} onClick={() => saveConfig(currentConfig.value)} class="bg-transparent border-0">
						<i title={lastError.value ?? "Apply Configuration"} class="fa-solid fa-check square" />
					</button>

					<button class="bg-transparent border-0" onClick={() => downloadFile(currentConfig.value)}>
						<i title="Download Caddyfile" class="fa-solid fa-download square clickable" />

					</button>
					<button class="bg-transparent border-0" onClick={() => handleCaddyfileImport().then(v => Boolean(v) && (initContent.value = v!))}>
						<i title="Import Caddyfile" class="fa-solid fa-file-import square clickable" />
					</button>

					<button
						class="bg-transparent border-0"
						onClick={() => confirm('revert to last known working state?') && client.LastCaddyfile().then(v => editor.current?.setValue(v)).catch(() => void(0))}
					>
						<i title="Restore last known Caddyfile" class="fa-solid fa-rotate-left square clickable" />
					</button>

					<ThemeToggle />
				</div>
			</div>
		</div>
	)
}

render(<App />, document.getElementById('app')!)