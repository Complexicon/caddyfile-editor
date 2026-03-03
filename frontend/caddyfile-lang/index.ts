type Monaco = typeof import('monaco-editor');
import type { editor } from 'monaco-editor';
import type { languages } from 'monaco-editor';

import { descriptions as globalOptionDescriptions } from "./globalDirectives";
import { descriptions as directiveDescriptions } from "./descriptions";

import { monarch } from './monarch';

function hasGlobalOptions(document: editor.ITextModel): boolean {
    if (document.getLineCount() < 2) {
        return false;
    }

    const text = document.getValueInRange({ startLineNumber: 1, startColumn: 0, endLineNumber: 2, endColumn: 0 });

    return text === '{\n';
}

interface Position {
    line: number,
    character: number
}

interface Range {
    start: Position;
    end: Position;
}

interface TextDocumentPositionParams {
    position: Position
}

export function getGlobalOptionsPosition(document: editor.ITextModel): Range | null {
    if (!hasGlobalOptions(document)) {
        return null;
    }

    // Start at line 1 and work towards the end of the file, we are trying to find the
    // first `}\n` that closes the global options block.
    for (let i = 1; i < document.getLineCount(); i++) {
        const text = document.getValueInRange({
            startLineNumber: i, startColumn: 0,
            endLineNumber: i + 1, endColumn: 0
        });

        if (text !== '}\n') {
            continue;
        }

        return {
            start: { line: 0, character: 0 },
            end: { line: i, character: 0 },
        };
    }

    return null;
}

export function isInGlobalOptions(document: editor.ITextModel, params: TextDocumentPositionParams): boolean {
    // Check if the document has a global options block.
    if (!hasGlobalOptions(document)) {
        return false;
    }

    const globalOptions = getGlobalOptionsPosition(document);
    if (globalOptions === null) {
        return false;
    }

    return params.position.line > globalOptions.start.line && params.position.line < globalOptions.end.line;
}

export function installCaddyfileLang(editor: editor.IStandaloneCodeEditor, monaco: Monaco) {

    monaco.languages.register({ id: 'caddyfile' });

    monaco.languages.setMonarchTokensProvider('caddyfile', monarch as any);

    monaco.languages.registerCompletionItemProvider('caddyfile', {
        provideCompletionItems(model, position, context, token) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const searchObj = isInGlobalOptions(model, { position: { character: position.column, line: position.lineNumber } }) ? globalOptionDescriptions : directiveDescriptions;

            const suggestions: languages.CompletionItem[] = Object.entries(searchObj).map(([directive, description]) => ({
                insertText: directive,
                documentation: { value: description, isTrusted: true },
                kind: monaco.languages.CompletionItemKind.Constant,
                label: directive,
                range,
            }));

            return { suggestions }
        },
    })

    monaco.languages.registerHoverProvider('caddyfile', {
        provideHover(model, position, token, context) {
            if (isInGlobalOptions(model, { position: { character: position.column, line: position.lineNumber } })) {
                const line = model.getValueInRange({
                    startLineNumber: position.lineNumber, startColumn: 0,
                    endLineNumber: position.lineNumber + 1, endColumn: 0
                }).trim();

                let option: string;
                if (line.includes(' ')) {
                    const sections = line.split(' ');
                    option = sections[0]!;
                } else {
                    option = line;
                }

                const description = globalOptionDescriptions[option];
                if (description === undefined) {
                    return null;
                }

                return {
                    contents: [{ value: description, isTrusted: true }],
                };
            }

            const line = model.getValueInRange({
                startLineNumber: position.lineNumber, startColumn: 0,
                endLineNumber: position.lineNumber + 1, endColumn: 0
            })
                .trim();

            let directive: string;
            if (line.includes(' ')) {
                const sections = line.split(' ');
                directive = sections[0]!;
            } else {
                directive = line;
            }

            const description = directiveDescriptions[directive];
            if (description === undefined) {
                return null;
            }

            return {
                contents: [{ value: description, isTrusted: true }],
            };
        },
    })

    monaco.languages.setLanguageConfiguration("caddyfile", {
        surroundingPairs: [{ open: "{", close: "}" }],
        autoClosingPairs: [{ open: "{", close: "}" }],
        brackets: [["{", "}"]],
        comments: {
            lineComment: '#'
        }
    })


    // monaco.languages.registerCompletionItemProvider('caddyfile', {
    //     provideCompletionItems(model, position, context, token) {
    //         return { suggestions: completions };
    //     },
    // })

}