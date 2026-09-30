if(process.env.NODE_ENV != 'production') {
	await import('preact/debug');
	//@ts-expect-error
	await import('virtual:hotreload'); 
}