<template>
	<div id="app">
		<ReactiveBase
			app="good-books-ds"
			credentials="nY6NNTZZ6:27b76b9f-18ea-456c-bc5e-3a5263ebc63d"
		>
			<ReactiveList
				ref="result"
				componentId="SearchResult"
				data-field="original_title.raw"
				class="result-list-container"
				:pagination="pagination"
				:size="10"
				:URLParams="true"
				:innerClass="{ list: 'items-wrapper' }"
				:currentPage="customPage"
			>

        <button slot="loadPrev" slot-scope="{ loadPrev }" @click="loadPrev">Load Prev</button>

				<div class="item" slot="renderItem" slot-scope="{ item }">
					<div class="flex book-content" key="item._id">
						<img :src="item.image" alt="Book Cover" class="book-image" />
					</div>
				</div>

        <button slot="loadNext" slot-scope="{ loadNext }" @click="loadNext">Load Next</button>

			</ReactiveList>
		</ReactiveBase>
	</div>
</template>

<script>
import '@/assets/css/styles.css';
export default {
	name: 'app',
	data() {
		return {
			customPage: 0,
      /*
      pagination: false,
      /*/
      pagination: 'continuous',
      // */
		}
	},
};
</script>

<style>
#app {
	font-family: 'Avenir', Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	color: #2c3e50;
}
</style>
