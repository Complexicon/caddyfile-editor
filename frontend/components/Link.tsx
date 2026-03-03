import { exec, useRouter } from 'preact-router';

export function Link({
	className,
	activeClass,
	activeClassName,
	path,
	...props
}: preact.JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { activeClass?: string, activeClassName?: string}) {
	const router = useRouter()[0];
	const matches =
		(path && router.path && exec(router.path, path, {})) ||
		exec(router.url, props.href as string, {});

	let inactive = props.class || className || '';
	let active = (matches && (activeClass || activeClassName)) || '';
	props.class = inactive + (inactive && active && ' ') + active;

	return <a {...props} />;
}