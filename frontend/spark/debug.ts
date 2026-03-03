if(process.env.NODE_ENV != 'production') {
	await import('preact/debug');
	//@ts-ignore
	await import('virtual:spark-hotreload'); 
}