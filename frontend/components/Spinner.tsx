import { css } from "@/spark/util";

const classes = css({
	overlay: {
		display: 'flex',
		position: 'absolute',
		zIndex: 2000,
		width: '100vw',
		height: '100vh',
		alignItems: 'center',
		justifyContent:'center',
		backgroundColor: 'rgba(0, 0, 0, 0.11)',
	},
})

export function Spinner() {
	return (
		<div class={`${classes.overlay} top-50 start-50 translate-middle`}>
			<i className='fas fa-circle-notch fa-3x spinning text-primary' />
		</div>
	)
}