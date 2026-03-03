import { decode, encode } from "./cbor"
import useSWR, { type SWRResponse, type SWRConfiguration } from "swr";

type ClientWithSWR<RPC> = {
	[Key in keyof RPC as `use${string & Key}`]:
	//@ts-ignore
	(arg0: Parameters<RPC[Key]>[0], opts?: SWRConfiguration) => SWRResponse<Awaited<ReturnType<RPC[Key]>>, Error>;
};

export default function Client<T extends object>(path = '/'): T & ClientWithSWR<T> {
	return new Proxy<T & ClientWithSWR<T>>({} as any, {
		get(target, p: string, receiver) {

			const isHook = p.startsWith('use');
			const method = isHook ? p.substring(3) : p;

			const doRPC = async (arg0: any) => {
				const result = await fetch(path + method, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/cbor'
					},
					body: encode(arg0)
				});

				if (result.headers.get('Rpc-Failed') === '1') {
					throw new Error(await result.text())
				} else {
					return decode(await result.arrayBuffer())
				}

			}

			if (isHook) {
				return (arg0: any, opts: SWRConfiguration) => {
					//@ts-ignore
					return useSWR(method, () => doRPC(arg0), opts)
				}
			} else {
				return doRPC;
			}
		},
	})
}