import { css } from "@/spark/util";
import { useSignal, useSignalEffect } from "@preact/signals";
import { useRef, type PropsWithChildren } from "preact/compat";

export const classes = css({
	modalDialog: {
		padding: 0,
		border: 'none',
		borderRadius: '5px',
		minWidth: '30vw',
		boxShadow: '0px 10px 13px -7px #000000, 5px 5px 15px 5px rgba(0,0,0,0)',
		position: 'relative'
	}
})

export function useDialog() {

	const visible = useSignal(false);

	return {
		Dialog: ({ children }: PropsWithChildren<{}>) => {

			const dlgRef = useRef<HTMLDialogElement>(null);

			useSignalEffect(() => {
				if (visible.value) dlgRef.current?.showModal();
				else dlgRef.current?.close();
			});

			return (
				<dialog class={classes.modalDialog} ref={dlgRef}>
					{visible.value && children}
				</dialog>
			)
		},
		open: () => visible.value = true,
		close: () => visible.value = false,
	}
}

export function DialogHeader({ children, close }: { children?: string, close: () => void }) {
	return (
		<div class="d-flex justify-content-between align-items-center">
			<h3>{children}</h3>
			<button class="p-3 bg-transparent border-0" onClick={close}>
				<i class="fa-solid fa-xmark fa-lg"></i>
			</button>
		</div>
	)
}