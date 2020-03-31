<template>
	<div id="app">
		<ReactiveBase
			app="good-books-ds"
			credentials="nY6NNTZZ6:27b76b9f-18ea-456c-bc5e-3a5263ebc63d"
		>
      <selected-filters />
      <SingleList
        componentId="Authors"
        data-field="authors.raw"
        class="single-list-container"
        :size="1"
        :showRadio="true"
        :showCount="true"
        :showSearch="false"
        :URLParams="true"
      />

			<ReactiveList
				ref="result"
				componentId="SearchResult"
				data-field="original_title.raw"
				class="result-list-container"
				:pagination="pagination"
				:size="size"
				:URLParams="true"
        :URLPageParam="'page'"
				:innerClass="{ list: 'items-wrapper' }"
        :react="{ and: ['Authors'] }"
        @pageAdd="pageAdd"
			>

        <button slot="loadPrev" slot-scope="{ load, isLoading }" @click="load" :disabled="isLoading">
          {{ isLoading ? 'Loading...' : 'Load Prev' }}
        </button>

				<div class="item" slot="renderItem" slot-scope="{ item }">
					<div class="flex book-content" key="item._id">
						<img :src="item.image" alt="Book Cover" class="book-image" />
					</div>
				</div>

        <button slot="loadNext" slot-scope="{ load, isLoading }" @click="load" :disabled="isLoading">
          {{ isLoading ? 'Loading...' : 'Load Next' }}
        </button>

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
      size: 10,
      pagination: 'continuous',
      // */
		}
	},
  methods: {
	  pageAdd(direction, lastAddedPage, totalPages) {
      console.log('pageAdd', direction, lastAddedPage, totalPages);
      // Insert before and keep current "view"
      /*
      if (direction === 'prev') {
        const itemsWrapper = document.getElementsByClassName('items-wrapper')[0];
        const items = itemsWrapper.getElementsByClassName('item');
        const deltaY = items[this.size].offsetTop - items[0].offsetTop;
        window.scrollBy(0, deltaY);
      }
      */
    },
  }
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
