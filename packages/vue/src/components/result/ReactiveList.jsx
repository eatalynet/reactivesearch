import { Actions, helper } from '@eatalynet/reactivecore';
import VueTypes from 'vue-types';
import Pagination from './addons/Pagination.jsx';
import PoweredBy from './addons/PoweredBy.jsx';
import ResultListWrapper from './addons/ResultListWrapper.jsx';
import ResultCardsWrapper from './addons/ResultCardsWrapper.jsx';
import {
	connect,
	isFunction,
	hasCustomRenderer,
	getComponent,
	getValidPropsKeys,
} from '../../utils/index';
import Flex from '../../styles/Flex';
import types from '../../utils/vueTypes';
import { resultStats, sortOptions } from '../../styles/results';

const {
	addComponent,
	removeComponent,
	setStreaming,
	watchComponent,
	setQueryOptions,
	updateQuery,
	loadMore,
	setValue,
	setQueryListener,
	updateComponentProps,
} = Actions;

const {
	isEqual,
	getQueryOptions,
	pushToAndClause,
	getClassName,
	parseHits,
	getOptionsFromQuery,
	getCompositeAggsQuery,
	checkSomePropChange,
	getResultStats,
} = helper;

const ReactiveList = {
	name: 'ReactiveList',
	components: {
		ResultListWrapper,
		ResultCardsWrapper,
	},
	data() {
		const props = this.$props;
		let $currentPage = 0;
		if (props.currentPage) {
			$currentPage = Math.max(props.currentPage - 1, 0);
		}

		this.__state = {
			from: $currentPage * props.size,
			fromNext: $currentPage * props.size,
			isLoading: true,
			isLoadingPrev: false, // Only for continuous pagination
			isLoadingNext: false, // Only for continuous pagination
			$currentPage,
		};
		return this.__state;
	},
	created() {
		// no support for pagination and aggregationField together
		if (this.pagination && this.aggregationField) {
			// TODO: verify if aggregationField is not compliant also with continuous pagination
			console.warn(
				'Pagination is not supported when aggregationField is present. The list will be rendered with infinite scroll',
			);
		}
		if (this.defaultPage >= 0) {
			this.$currentPage = this.defaultPage;
			this.from = this.$currentPage * this.$props.size;
			this.fromNext = this.from;
		}
		this.isLoading = true;
		this.internalComponent = `${this.$props.componentId}__internal`;
		const onQueryChange = (...args) => {
			const [oldQuery, newQuery] = args;
			if (
				this.isContinuousPagination && oldQuery && newQuery
				&& !isEqual(oldQuery.query, newQuery.query)
			) {
				// Query has changed (i.e. applied some filter to another component), reset to first page.
				// N.B. from in Redux state is already reset to 0 at mount, anyway here is too late to
				// update it via setQueryOptions(). The other approach is to set newQuery.from directly
				// here, but quite dirty, query args here should be read-only.
				this.resetPageOnQueryChange && this.resetToFirstPage();
			}
			this.$emit('queryChange', ...args);
		};
		const onError = e => {
			this.$emit('error', e);
		};
		this.setQueryListener(this.$props.componentId, onQueryChange, onError);
	},
	props: {
		currentPage: VueTypes.number.def(0),
		includeFields: types.includeFields.def(['*']),
		// component props
		className: types.string,
		componentId: types.stringRequired,
		dataField: types.stringRequired,
		aggregationField: types.string,
		defaultQuery: types.func,
		excludeFields: types.excludeFields.def([]),
		innerClass: types.style,
		listClass: VueTypes.string.def(''),
		loader: types.title,
		render: types.func,
		renderItem: types.func,
		renderNoResults: VueTypes.any.def('No Results found.'),
		renderError: types.title,
		renderResultStats: types.func,
		pages: VueTypes.number.def(5),
		pagination: types.pagination.def(false),
		paginationAt: types.paginationAt.def('bottom'),
		react: types.react,
		showResultStats: VueTypes.bool.def(true),
		showEndPage: VueTypes.bool.def(false),
		size: VueTypes.number.def(10),
		sortBy: types.sortBy,
		sortOptions: types.sortOptions,
		stream: types.bool,
		URLParams: VueTypes.bool.def(false),
		URLPageParam: types.string.def(''), // N.B. DO NOT works with SSR!!! Is overwritten by initReactivesearch()
		resetPageOnQueryChange: VueTypes.bool.def(true),
	},
	computed: {
		shouldRenderPagination() {
			return this.pagination && !this.aggregationField && !this.isContinuousPagination;
		},
		isContinuousPagination() {
			return this.pagination === 'continuous';
		},
		totalPages() {
			return Math.ceil(this.total / this.$props.size) || 0;
		},
		hasPageChangeListener() {
			return this.$listeners && this.$listeners.pageChange;
		},
		hasResultStatsListener() {
			return this.$listeners && this.$listeners.resultStats;
		},
		stats() {
			const { currentPage } = this;
			const { filteredResults } = this.getAllData();
			return {
				...getResultStats(this),
				currentPage,
				displayedResults: filteredResults.length,
			};
		},
		hasCustomRender() {
			return hasCustomRenderer(this);
		},
		continuousShowLoadPrev() {
			// TODO: test isLoading instead of hits?
			return this.hits && this.from > 0;
		},
		continuousShowLoadNext() {
			// N.B. this.total in an object in SSR but a numeric value on client!?!? Need this fix for handle load next slot in SSR
			const total = typeof this.total === 'object' ? this.total.value : this.total;
			// TODO: test isLoading instead of hits?
			return this.hits && this.$data.fromNext + this.$props.size < total;
		},
	},
	watch: {
		sortOptions(newVal, oldVal) {
			if (!isEqual(oldVal, newVal)) {
				this.updateQueryOptions(this.$props);
			}
		},
		sortBy(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.updateQueryOptions(this.$props);
			}
		},
		size(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.updateQueryOptions(this.$props);
			}
		},
		dataField(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.updateQueryOptions(this.$props);
			}
		},
		includeFields(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.updateQueryOptions(this.$props);
			}
		},
		excludeFields(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.updateQueryOptions(this.$props);
			}
		},
		stream(newVal, oldVal) {
			if (oldVal !== newVal) {
				this.setStreaming(this.$props.componentId, newVal);
			}
		},
		react(newVal, oldVal) {
			if (!isEqual(newVal, oldVal)) {
				this.setReact(this.$props);
			}
		},
		streamHits() {
			this.$emit('data', this.getData());
		},
		promotedResults(newVal, oldVal) {
			if (!isEqual(newVal, oldVal)) {
				this.$emit('data', this.getData());
			}
		},
		hidden(newVal, oldVal) {
			if (!isEqual(newVal, oldVal)) {
				this.$emit('data', this.getData());
			}
		},
		time(newVal, oldVal) {
			if (!isEqual(newVal, oldVal)) {
				this.$emit('data', this.getData());
			}
		},
		hits(newVal, oldVal) {
			this.$emit('data', this.getAllData());
			if (this.shouldRenderPagination) {
				// called when page is changed
				if (this.isLoading && (oldVal || newVal)) {
					if (this.hasPageChangeListener) {
						this.$emit('pageChange', this.$currentPage + 1, this.totalPages);
					} else {
						window.scrollTo(0, 0);
					}
					this.isLoading = false;
				}
			} else if (oldVal && newVal) {
				if (oldVal.length !== newVal.length || newVal.length === this.$props.total) {
					this.isLoading = false;

					// Continuous pagination bypass this part! Purpose is not clear,
					// "integrated" scroll not wanted and page reset on query changed already managed.
					if (!this.isContinuousPagination && newVal.length < oldVal.length) {
						// query has changed
						window.scrollTo(0, 0);
						this.from = 0;
					}
				}
			} else if ((!oldVal || !oldVal.length) && newVal) {
				this.isLoading = false;
			}
			// Continuous pagination
			if (
				this.isContinuousPagination && oldVal && oldVal.length && newVal && newVal.length
				&& (this.isLoadingPrev || this.isLoadingNext)
			) {
				// TODO: maybe is better/safer to compare [0]._id?
				const direction = oldVal[0] === newVal[0] ? 'next' : 'prev';
				// Reset isLoadingPrev/Next
				this[direction === 'next' ? 'isLoadingNext' : 'isLoadingPrev'] = false;
				// Emit pageAdd, use $nextTick so DOM is already updated
				const fromDirection = this[direction === 'next' ? 'fromNext' : 'from'];
				const lastAddedPage = Math.ceil(fromDirection / this.$props.size) + 1;
				this.$nextTick(function() {
					this.$emit('pageAdd', direction, lastAddedPage, this.totalPages);
				});
			}
		},
		total(newVal, oldVal) {
			if (this.shouldRenderPagination && newVal !== oldVal) {
				let currentPage = this.$data.total ? 0 : this.$currentPage;
				if (this.defaultPage >= 0) currentPage = this.defaultPage;
				this.$currentPage = currentPage;
				this.$emit('pageChange', currentPage + 1, this.totalPages);
			}
		},
		currentPage(newVal, oldVal) {
			if (oldVal !== newVal && newVal > 0 && newVal <= this.totalPages) {
				this.setPage(newVal - 1);
			}
		},
		pagination(newVal, oldVal) {
			if (newVal !== oldVal) {
				if (!newVal) {
					window.addEventListener('scroll', this.scrollHandler);
				} else {
					window.removeEventListener('scroll', this.scrollHandler);
				}
			} // handle window url history change (on native back and forth interactions)
		},
		defaultPage(newVal) {
			if (this.$currentPage !== newVal && this.defaultPage !== newVal) {
				this.setPage(newVal >= 0 ? newVal : 0);
			}
		},
	},
	mounted() {
		this.addComponent(this.internalComponent);
		this.addComponent(this.$props.componentId);

		if (this.$props.stream) {
			this.setStreaming(this.$props.componentId, true);
		}

		let options = getQueryOptions(this.$props);
		options.from = this.$data.from;

		if (this.$props.sortOptions) {
			options.sort = [
				{
					[this.$props.sortOptions[0].dataField]: {
						order: this.$props.sortOptions[0].sortBy,
					},
				},
			];
		} else if (this.$props.sortBy) {
			options.sort = [
				{
					[this.$props.dataField]: {
						order: this.$props.sortBy,
					},
				},
			];
		} // Override sort query with defaultQuery's sort if defined

		this.$defaultQuery = null;

		if (this.$props.defaultQuery) {
			this.$defaultQuery = this.$props.defaultQuery();
			options = { ...options, ...getOptionsFromQuery(this.$defaultQuery) };

			if (this.$defaultQuery.sort) {
				options.sort = this.$defaultQuery.sort;
			}
		}
		// execute is set to false at the time of mount
		const { sort, ...query } = this.$defaultQuery || {};
		// to avoid firing (multiple) partial queries.
		// Hence we are building the query in parts here
		// and only executing it with setReact() at core

		const execute = false;
		this.setQueryOptions(
			this.$props.componentId,
			{ ...options, ...this.getAggsQuery() },
			execute,
		);

		if (this.$defaultQuery) {
			this.updateQuery(
				{
					componentId: this.internalComponent,
					query,
				},
				execute,
			);
		} else {
			this.updateQuery(
				{
					componentId: this.internalComponent,
					query: null,
				},
				execute,
			);
		} // query will be executed here

		this.setReact(this.$props);

		// Reset from in Redux to 0, so a query change can reset pagination (see onQueryChange() above)
		this.setQueryOptions(
			this.$props.componentId,
			{ ...options, ...this.getAggsQuery(), from: 0 },
			false,
		);

		if (!this.shouldRenderPagination && !this.isContinuousPagination) {
			window.addEventListener('scroll', this.scrollHandler);
		}

		const propsKeys = getValidPropsKeys(this.$props);
		this.updateComponentProps(this.componentId, this.$props);
		this.$watch(propsKeys.join('.'), (newVal, oldVal) => {
			checkSomePropChange(newVal, oldVal, propsKeys, () => {
				this.updateComponentProps(this.componentId, this.$props);
			});
		});
		// N.B. Watcher on defaultQuery works properly only in this way.
		// Being a function, can't be compared old VS new return value in "classic" watcher definition.
		this.$watch(
			() => typeof this.$props.defaultQuery === 'function' ? this.$props.defaultQuery() : null,
			(newVal, oldVal) => {
				if (newVal && !isEqual(newVal, oldVal)) {
					let options = getQueryOptions(this.$props);
					options.from = 0;
					this.$defaultQuery = newVal;
					const { sort, ...query } = this.$defaultQuery;

					if (sort) {
						options.sort = this.$defaultQuery.sort;
					}
					const queryOptions = getOptionsFromQuery(this.$defaultQuery);
					if (queryOptions) {
						options = { ...options, ...getOptionsFromQuery(this.$defaultQuery) };
					}
					this.setQueryOptions(
						this.$props.componentId,
						{ ...options, ...this.getAggsQuery() },
						!query,
					);

					this.updateQuery(
						{
							componentId: this.internalComponent,
							query,
						},
						true,
					); // reset page because of query change

					this.$currentPage = 0;
					this.from = 0;
				}
			},
		);
	},

	beforeDestroy() {
		this.removeComponent(this.$props.componentId);
		this.removeComponent(this.internalComponent);
		window.removeEventListener('scroll', this.scrollHandler);
	},

	render() {
		const { size } = this.$props;
		const { hits } = this.$data;
		const results = parseHits(hits) || [];
		const streamResults = parseHits(this.$data.streamHits) || [];
		let filteredResults = results;

		const renderItem = this.$scopedSlots.renderItem || this.$props.renderItem;

		if (streamResults.length) {
			const ids = streamResults.map(item => item._id);
			filteredResults = filteredResults.filter(item => !ids.includes(item._id));
		}

		return (
			<div style={this.$props.style} class={this.$props.className}>
				{this.isLoading
					&& this.shouldRenderPagination
					&& (this.$scopedSlots.loader || this.$props.loader)}
				{this.renderErrorComponent()}
				<Flex
					labelPosition={this.$props.sortOptions ? 'right' : 'left'}
					class={getClassName(this.$props.innerClass, 'resultsInfo')}
				>
					{this.$props.sortOptions ? this.renderSortOptions() : null}
					{this.$props.showResultStats ? this.renderStats() : null}
				</Flex>
				{!this.isLoading && results.length === 0 && streamResults.length === 0
					? this.renderNoResult()
					: null}
				{this.shouldRenderPagination
				&& (this.$props.paginationAt === 'top' || this.$props.paginationAt === 'both') ? (
						<Pagination
							pages={this.$props.pages}
							totalPages={this.totalPages}
							currentPage={this.$currentPage}
							setPage={this.setPage}
							innerClass={this.$props.innerClass}
						/>
					) : null}

				{this.isContinuousPagination ? (
					this.continuousShowLoadPrev ? (
						this.$scopedSlots.loadPrev
							? this.$scopedSlots.loadPrev({ load: this.continuousLoadPrev, isLoading: this.isLoadingPrev })
							: <button onClick={this.continuousLoadPrev} disabled={this.isLoadingPrev}>
								{this.isLoadingPrev ? 'loading...' : 'prev'}
							</button>
					) : (this.$scopedSlots.firstPageLoadAlt ? this.$scopedSlots.firstPageLoadAlt() : null)
				) : null}

				{this.hasCustomRender ? (
					this.getComponent()
				) : (
					<div
						class={`${this.$props.listClass} ${getClassName(
							this.$props.innerClass,
							'list',
						)}`}
					>
						{[...streamResults, ...filteredResults].map((item, index) =>
							renderItem({
								item,
								triggerClickAnalytics: () =>
									this.triggerClickAnalytics(this.$currentPage * size + index),
							}),
						)}
					</div>
				)}
				{this.isLoading && !this.shouldRenderPagination
					? this.$props.loader || (
						<div
							style={{
								textAlign: 'center',
								margin: '20px 0',
								color: '#666',
							}}
						>
								Loading...
						</div>
					  )
					: null}
				{this.shouldRenderPagination
				&& (this.$props.paginationAt === 'bottom' || this.$props.paginationAt === 'both') ? (
						<Pagination
							pages={this.$props.pages}
							totalPages={Math.ceil(this.$data.total / this.$props.size)}
							currentPage={this.$currentPage}
							setPage={this.setPage}
							showEndPage={this.$props.showEndPage}
							innerClass={this.$props.innerClass}
						/>
					) : null}

				{this.isContinuousPagination && this.continuousShowLoadNext ? (
					this.$scopedSlots.loadNext
						? this.$scopedSlots.loadNext({ load: this.continuousLoadNext, isLoading: this.isLoadingNext })
						: <button onClick={this.continuousLoadNext} disabled={this.isLoadingNext}>
							{this.isLoadingNext ? 'loading...' : 'next'}
						</button>
				) : null}


				{this.config.url.endsWith('appbase.io') && results.length ? (
					<Flex
						direction="row-reverse"
						class={getClassName(this.$props.innerClass, 'poweredBy')}
					>
						<PoweredBy />
					</Flex>
				) : null}
			</div>
		);
	},

	methods: {
		renderErrorComponent() {
			const renderError = this.$scopedSlots.renderError || this.$props.renderError;
			if (renderError && this.error && !this.isLoading) {
				return isFunction(renderError) ? renderError(this.error) : renderError;
			}
			return null;
		},
		updateQueryOptions(props) {
			const options = getQueryOptions(props);
			options.from = this.$data.from;

			if (props.sortOptions) {
				options.sort = [
					{
						[props.sortOptions[0].dataField]: {
							order: props.sortOptions[0].sortBy,
						},
					},
				];
			} else if (props.sortBy) {
				options.sort = [
					{
						[props.dataField]: {
							order: props.sortBy,
						},
					},
				];
			}
			this.setQueryOptions(
				this.$props.componentId,
				{ ...options, ...this.getAggsQuery() },
				true,
			);
		},
		getAggsQuery() {
			const { size, aggregationField } = this.$props;
			const { afterKey } = this.$data;
			const queryOptions = { size };
			if (aggregationField) {
				queryOptions.aggs = getCompositeAggsQuery(
					{},
					this.$props,
					afterKey ? { after: afterKey } : null,
					true,
				).aggs;
			}
			return queryOptions;
		},
		setReact(props) {
			const { react } = props;

			if (react) {
				const newReact = pushToAndClause(react, this.internalComponent);
				this.watchComponent(props.componentId, newReact);
			} else {
				this.watchComponent(props.componentId, {
					and: this.internalComponent,
				});
			}
		},

		scrollHandler() {
			if (
				!this.isLoading
				&& window.innerHeight + window.pageYOffset + 300 >= document.body.offsetHeight
			) {
				this.loadMore();
			}
		},

		loadMore() {
			if (this.aggregationField && !this.afterKey) return;
			if (this.hits && !this.shouldRenderPagination && this.total !== this.hits.length) {
				const value = this.$data.from + this.$props.size;
				const options = { ...getQueryOptions(this.$props), ...this.getAggsQuery() };
				this.from = value;
				this.isLoading = true;
				this.loadMoreAction(
					this.$props.componentId,
					{
						...options,
						from: value,
					},
					true,
					!!this.aggregationField,
				);
			} else if (this.isLoading) {
				this.isLoading = false;
			}
		},

		// Quite redundant with loadMore(), but kept separate for smoother update/merge
		continuousLoadMore(direction = 'next') {
			if (!this.isContinuousPagination || (this.aggregationField && !this.afterKey)) return;
			const loadingName = direction === 'next' ? 'isLoadingNext' : 'isLoadingPrev';
			if (this.hits && !this.shouldRenderPagination && (
				(direction === 'next' && this.continuousShowLoadNext) ||
				(direction !== 'next' && this.continuousShowLoadPrev)
			)) {
				const value = direction === 'next'
					? this.$data.fromNext + this.$props.size
					: this.$data.from - this.$props.size;
				const options = { ...getQueryOptions(this.$props), ...this.getAggsQuery() };
				this[direction === 'next' ? 'fromNext' : 'from'] = value;
				this[loadingName] = true;
				this.loadMoreAction(
					this.$props.componentId,
					{
						...options,
						from: value,
					},
					direction === 'next', // append
					!!this.aggregationField,
					direction !== 'next', // prepend
				);
				// Set page in URL (TODO: move on hits change?)
				if (this.$props.URLParams && direction === 'next') {
					this.setPageURL(
						this.$props.URLPageParam || this.$props.componentId,
						Math.ceil(value / this.$props.size) + 1,
						this.$props.URLPageParam || this.$props.componentId,
						false,
						true,
					);
				}

			} else if (this[loadingName]) {
				this[loadingName] = false;
			}
		},

		continuousLoadPrev() {
			this.continuousLoadMore('prev');
		},

		continuousLoadNext() {
			this.continuousLoadMore('next');
		},

		resetToFirstPage() {
			this.$currentPage = 0;
			this.from = this.$currentPage * this.$props.size;
			this.fromNext = this.from;
			this.setPageURL(
				this.$props.URLPageParam || this.$props.componentId,
				null,
				this.$props.URLPageParam || this.$props.componentId,
				false,
				true,
			);
			this.$emit('resetToFirstPage');
		},

		setPage(page) {
			// pageClick will be called every time a pagination button is clicked
			if (page !== this.$currentPage) {
				this.$emit('pageClick', page + 1);
				const value = this.$props.size * page;
				const options = getQueryOptions(this.$props);
				options.from = this.$data.from;
				this.from = value;
				this.isLoading = true;
				this.$currentPage = page;
				this.loadMoreAction(
					this.$props.componentId,
					{
						...options,
						from: value,
					},
					false,
				);

				if (this.$props.URLParams) {
					this.setPageURL(
						this.$props.URLPageParam || this.$props.componentId,
						page + 1,
						this.$props.URLPageParam || this.$props.componentId,
						false,
						true,
					);
				}
			}
		},

		renderStats() {
			const renderResultStats
				= this.$scopedSlots.renderResultStats || this.$props.renderResultStats;
			if (renderResultStats && this.$data.total) {
				return renderResultStats(this.stats);
			} else if (this.stats.numberOfResults) {
				return (
					<p
						class={`${resultStats} ${getClassName(
							this.$props.innerClass,
							'resultStats',
						)}`}
					>
						{this.stats.numberOfResults} results found in {this.stats.time}
						ms
					</p>
				);
			}
			return null;
		},

		renderNoResult() {
			const renderNoResults
				= this.$scopedSlots.renderNoResults || this.$props.renderNoResults;
			return (
				<p class={getClassName(this.$props.innerClass, 'noResults') || null}>
					{isFunction(renderNoResults) ? renderNoResults() : renderNoResults}
				</p>
			);
		},

		handleSortChange(e) {
			const index = e.target.value;
			// This fixes issue #371 (where sorting a multi-result page with infinite loader breaks)
			const options = getQueryOptions(this.$props);
			options.from = 0;
			options.sort = [
				{
					[this.$props.sortOptions[index].dataField]: {
						order: this.$props.sortOptions[index].sortBy,
					},
				},
			];
			this.setQueryOptions(this.$props.componentId, options, true);
			this.$currentPage = 0;
			this.from = 0;
		},
		triggerClickAnalytics(searchPosition) {
			// click analytics would only work client side and after javascript loads
			const {
				config,
				analytics: { searchId },
			} = this;
			const { url, app, credentials } = config;
			if (config.analytics && searchId) {
				fetch(`${url}/${app}/_analytics`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${btoa(credentials)}`,
						'X-Search-Id': searchId,
						'X-Search-Click': true,
						'X-Search-ClickPosition': searchPosition + 1,
					},
				});
			}
		},

		renderSortOptions() {
			return (
				<select
					class={`${sortOptions} ${getClassName(this.$props.innerClass, 'sortOptions')}`}
					name="sort-options"
					onChange={this.handleSortChange}
				>
					{this.$props.sortOptions.map((sort, index) => (
						<option key={sort.label} value={index}>
							{sort.label}
						</option>
					))}
				</select>
			);
		},
		withClickIds(results) {
			const { base } = this.getAllData();
			return results.map((result, index) => ({
				...result,
				_click_id: base + index,
			}));
		},
		// Shape of the object to be returned in onData & render
		getAllData() {
			const { size, promotedResults, aggregationData, currentPage, hits, streamHits } = this;
			const results = parseHits(hits) || [];
			const streamResults = parseHits(streamHits) || [];
			let filteredResults = results;
			const base = currentPage * size;
			if (streamResults.length) {
				const ids = streamResults.map(item => item._id);
				filteredResults = filteredResults.filter(item => !ids.includes(item._id));
			}

			if (promotedResults.length) {
				const ids = promotedResults.map(item => item._id).filter(Boolean);
				if (ids) {
					filteredResults = filteredResults.filter(item => !ids.includes(item._id));
				}

				filteredResults = [...streamResults, ...promotedResults, ...filteredResults];
			}
			return {
				results,
				streamResults,
				filteredResults,
				promotedResults,
				aggregationData,
				loadMore: this.loadMore,
				base,
				triggerClickAnalytics: this.triggerClickAnalytics,
			};
		},
		getData() {
			const {
				results,
				streamResults,
				filteredResults,
				promotedResults,
				aggregationData,
			} = this.getAllData();
			return {
				data: this.withClickIds(filteredResults),
				aggregationData: this.withClickIds(aggregationData || []),
				streamData: this.withClickIds(streamResults),
				promotedData: this.withClickIds(promotedResults),
				rawData: this.withClickIds(results),
				resultStats: this.stats,
			};
		},
		getComponent() {
			const { error, isLoading } = this;
			const data = {
				error,
				loading: isLoading,
				loadMore: this.loadMore,
				triggerAnalytics: this.triggerClickAnalytics,
				...this.getData(),
			};
			return getComponent(data, this);
		},
	},
};
const mapStateToProps = (state, props) => ({
	defaultPage:
		(state.selectedValues[props.URLPageParam || props.componentId]
			&& state.selectedValues[props.URLPageParam || props.componentId].value - 1)
		|| -1,
	hits: state.hits[props.componentId] && state.hits[props.componentId].hits,
	aggregationData: state.compositeAggregations[props.componentId] || [],
	promotedResults: state.promotedResults[props.componentId] || [],
	streamHits: state.streamHits[props.componentId],
	time: (state.hits[props.componentId] && state.hits[props.componentId].time) || 0,
	total: state.hits[props.componentId] && state.hits[props.componentId].total,
	hidden: state.hits[props.componentId] && state.hits[props.componentId].hidden,
	analytics: state.analytics,
	config: state.config,
	error: state.error[props.componentId],
	afterKey:
		state.aggregations[props.componentId]
		&& state.aggregations[props.componentId][props.aggregationField]
		&& state.aggregations[props.componentId][props.aggregationField].after_key,
});
const mapDispatchtoProps = {
	addComponent,
	loadMoreAction: loadMore,
	removeComponent,
	setPageURL: setValue,
	setQueryOptions,
	setQueryListener,
	setStreaming,
	updateQuery,
	watchComponent,
	updateComponentProps,
};
// Only used for SSR
ReactiveList.generateQueryOptions = props => {
	// simulate default (includeFields and excludeFields) props to generate consistent query
	const options = getQueryOptions({ includeFields: ['*'], excludeFields: [], ...props });
	options.from = props.currentPage ? (props.currentPage - 1) * (props.size || 10) : 0;
	options.size = props.size || 10;

	if (props.sortOptions) {
		options.sort = [
			{
				[props.sortOptions[0].dataField]: {
					order: props.sortOptions[0].sortBy,
				},
			},
		];
	} else if (props.sortBy) {
		options.sort = [
			{
				[props.dataField]: {
					order: props.sortBy,
				},
			},
		];
	}

	return options;
};
export const RLConnected = connect(mapStateToProps, mapDispatchtoProps)(ReactiveList);

ReactiveList.install = function(Vue) {
	Vue.component(ReactiveList.name, RLConnected);
	Vue.component(ResultListWrapper.name, ResultListWrapper);
	Vue.component(ResultCardsWrapper.name, ResultCardsWrapper);
};
export default ReactiveList;
