import { Inline, route, SEO } from '../document-helpers.tsx';

export function PageDescription(props: { content?: string }) {
	return (
		<SEO>
			<meta
				name="description"
				content={
					props.content ??
					'InvisiProxy is a secure web proxy service with support for many sites. Bypass filters and freely enjoy a safer private browsing experience or unblock websites on devices such as Chromebooks and at places like school or work without downloading anything.'
				}
			/>
		</SEO>
	);
}

export function ParticlesScript() {
	return (
		<script
			src="https://unpkg.com/tsparticles@3.8.1/tsparticles.bundle.min.js"
			defer={true}
			data-module=""
			innerHTML=""
		/>
	);
}

export function TooltipScripts() {
	return (
		<>
			<script
				src="https://unpkg.com/@popperjs/core@2"
				defer={true}
				data-module=""
				innerHTML=""
			/>
			<script
				src="https://unpkg.com/tippy.js@6"
				defer={true}
				innerHTML=""
			/>
		</>
	);
}

export function ScramjetScripts(props: { utilities?: boolean }) {
	return (
		<>
			<script
				src={route('/scram/scramjet.js')}
				defer={true}
				data-module=""
				innerHTML=""
			/>
			<script
				src={route('/scram/controller.api.js')}
				defer={true}
				data-module=""
				innerHTML=""
			/>
			{props.utilities && (
				<script
					src={route('/scram/scramjet-utils.js')}
					defer={true}
					data-module=""
					innerHTML=""
				/>
			)}
		</>
	);
}

export function RegisterServiceWorkerScript() {
	return (
		<Inline>
			<script
				src={route('/assets/js/register-sw.js', 'inline')}
				defer={true}
				innerHTML=""
			/>
		</Inline>
	);
}

export function PageScripts(props: {
	common?: boolean;
	registerServiceWorker?: boolean;
}) {
	const scripts = [
		<script
			src={route('assets/js/link.js', 'inline')}
			defer={true}
			innerHTML=""
		/>,
		<script
			src={route('assets/js/csel.js', 'inline')}
			defer={true}
			innerHTML=""
		/>,
	];
	if (props.registerServiceWorker) {
		scripts.unshift(
			<script
				src={route('/assets/js/register-sw.js', 'inline')}
				defer={true}
				innerHTML=""
			/>
		);
	}
	if (props.common !== false) {
		scripts.push(
			<script
				src={route('assets/js/common.js', 'inline')}
				defer={true}
				innerHTML=""
			/>
		);
		scripts.push(
			<script
				src={route('assets/js/chat.js', 'inline')}
				defer={true}
				innerHTML=""
			/>
		);
	}
	return <Inline>{scripts}</Inline>;
}
