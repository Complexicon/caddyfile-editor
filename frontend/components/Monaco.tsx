import loader from '@monaco-editor/loader';
import type { editor } from 'monaco-editor';
import { useEffect, useRef } from 'preact/hooks';

export const monaco = (await loader.init()) as typeof import('monaco-editor');

type EditorParams = {
    onChange?: (arg: string, editor: editor.IStandaloneCodeEditor) => void,
    initContent?: string
    language?: string
    theme?: 'vs-dark' | 'vs'
    bootstrap?: (editor: editor.IStandaloneCodeEditor, monacoRef: typeof monaco) => (() => void) | void
}

export function Monaco({ initContent = '', onChange, bootstrap, language = 'json', theme = 'vs-dark' }: EditorParams) {

    const container = useRef<HTMLDivElement>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor>(null);
    
    useEffect(() => {
        editorRef.current?.setValue(initContent);
    }, [initContent])

    useEffect(() => {
        editorRef.current?.updateOptions({ theme });
    }, [theme]);

    useEffect(() => {
        const editor = monaco.editor.create(container.current!, {
            value: initContent,
            automaticLayout: true,
            language,
            theme,
        });

        editorRef.current = editor;

        let bootstrapCleanup: ReturnType<NonNullable<EditorParams['bootstrap']>>;

        if (bootstrap) {
            bootstrapCleanup = bootstrap(editor, monaco);
        }

        setTimeout(() => {
            const error = monaco.editor.getModelMarkers({})[0];
            error && editor.revealLineInCenter(error.startLineNumber);
        }, 1000);
        
        const eventListener = editor.onDidChangeModelContent(() => onChange && onChange(editor.getValue(), editor))

        return () => {
            bootstrapCleanup?.();
            eventListener.dispose();
            editor.getModel()?.dispose();
            editor.dispose();
        }
    }, []);

    return <div class="flex-fill" ref={container}/>
}