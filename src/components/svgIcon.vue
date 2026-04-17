<template>
  <div
    class="svg-icon"
    :class="svgIconClass"
    :style="containerStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="$emit('click', $event)"
  >
    <div
      class="icon-inner"
      :style="iconInnerStyle"
    ></div>
  </div>
</template>

<script>
export default {
  name: "SvgIcon",
  props: {
    /**
     * SVG文件路径或文件名
     */
    file: {
      type: String,
      required: true
    },
    /**
     * 字体大小
     */
    fontSize: {
      type: String,
      default: '14px'
    },
    /**
     * 默认图标颜色
     */
    color: {
      type: String,
      default: 'currentColor'
    },
    /**
     * 悬浮时的图标颜色
     */
    hoverColor: {
      type: String,
      default: ''
    },
    /**
     * 额外的类名
     */
    svgIconClass: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      isHover: false
    }
  },
  computed: {
    /**
     * 处理后的图标路径
     */
    iconPath() {
      let path = this.file
      if (path && !path.startsWith('http') && !path.startsWith('data:') && !path.endsWith('.svg')) {
        path = `${path}.svg`
      }
      return path
    },
    /**
     * 当前显示的颜色
     */
    displayColor() {
      return (this.isHover && this.hoverColor) ? this.hoverColor : this.color
    },
    /**
     * 外层容器样式
     */
    containerStyle() {
      return {
        width: this.fontSize,
        height: this.fontSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
    /**
     * 内部遮罩样式 - 核心修复：使用 mask-image 替代 drop-shadow 方案
     */
    iconInnerStyle() {
      const url = `url(${this.iconPath})`
      return {
        width: '100%',
        height: '100%',
        backgroundColor: this.displayColor,
        '-webkit-mask-image': url,
        'mask-image': url,
        '-webkit-mask-size': 'contain',
        'mask-size': 'contain',
        '-webkit-mask-repeat': 'no-repeat',
        'mask-repeat': 'no-repeat',
        '-webkit-mask-position': 'center',
        'mask-position': 'center',
        transition: 'background-color 0.2s ease'
      }
    }
  },
  methods: {
    handleMouseEnter() {
      this.isHover = true
      this.$emit('mouseenter')
    },
    handleMouseLeave() {
      this.isHover = false
      this.$emit('mouseleave')
    }
  }
}
</script>

<style scoped>
.svg-icon {
  position: relative;
  vertical-align: middle;
  cursor: pointer;
  overflow: hidden;
}

.icon-inner {
  display: block;
}
</style>