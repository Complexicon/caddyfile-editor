import { cloneElement, createContext, type VNode } from 'preact';
import { Router } from 'preact-router';
import { useContext } from 'preact/hooks';

const RouteBaseContext = createContext('');

export function SubRouter({ base, children }: { base: string, children: VNode<any>[] }) {
    const parentBase = useContext(RouteBaseContext);
    const fullBase = parentBase + base;

    return (
        <RouteBaseContext.Provider value={fullBase}>
            <Router>
                {children?.map(child =>
                    cloneElement(child, {
                        path: fullBase + (child.props.path || ''),
                    })
                )}
            </Router>
        </RouteBaseContext.Provider>
    );
}
