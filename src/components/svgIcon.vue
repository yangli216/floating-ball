<template>
  <div
      class="svg-icon"
      :class="svgIconClass"
      :style="getSvgIconDivStyle()"
      @mouseenter="handleMouseEnter"
      @click="svgIconClick"
      @mouseleave="handleMouseLeave"
  >
    <img
        :class="classRandom"
        :src="getSvgIconImgSrc()"
        :style="svgIconImgStyle"
    />
  </div>
</template>

<script>
export default {
  name: "SvgIcon",

  props: {
    /**
     * SVG文件路径或文件名
     * @type {String}
     * @required
     */
    file: {
      type: String,
      required: true
    },

    /**
     * 字体大小
     * @type {String}
     * @default '14px'
     */
    fontSize: String,

    /**
     * 图标颜色
     * @type {String}
     * @default undefined
     */
    color: String,

    /**
     * 自定义图标类名
     * @type {String}
     * @default ''
     */
    svgIconClass: {
      type: String,
      default: ''
    },

    /**
     * 图标hover颜色
     * @type {String}
     * @default undefined
     */
    hoverColor: {
      type: String,
      default: undefined
    },

    /**
     * 点击事件回调函数
     * @type {Function}
     * @default () => {}
     */
    svgIconClick: {
      type: Function,
      default: () => {}
    },

    /**
     * 鼠标进入事件回调函数
     * @type {Function}
     * @default () => {}
     */
    mouseEnter: {
      type: Function,
      default: () => {}
    },

    /**
     * 鼠标离开事件回调函数
     * @type {Function}
     * @default () => {}
     */
    mouseLeave: {
      type: Function,
      default: () => {}
    }
  },

  data() {
    return {
      /**
       * 图标图片样式
       */
      svgIconImgStyle: {},

      /**
       * 随机类名，用于动态修改样式
       */
      classRandom: '',
      isHover: false,
    }
  },

  computed: {
    /**
     * 基础默认字体图标样式大小
     * @returns {String}
     */
    BaseFontSize() {
      return '14px'
    },

    /**
     * 基础默认路径
     * @returns {String}
     */
    BaseFilePath() {
      return 'resources/svgs/'
    },

    /**
     * 获取计算后的字体大小
     * @returns {String}
     */
    getSvgIconFontSize() {
      let _file = this.file,
          _fontSize = '0px'

      if (_file) {
        _fontSize = this.fontSize ? this.fontSize : this.BaseFontSize

        if (!_fontSize.endsWith('px')) {
          _fontSize += 'px'
        }
      }

      return _fontSize
    }
  },

  watch: {
    /**
     * 监听颜色变化，动态更新图标颜色
     */
    color: {
      handler(newVal) {
        let element = document.getElementsByClassName(this.classRandom)[0]
        if (element) {
          element.style.color = newVal
          element.style.filter = `drop-shadow(${newVal} ${this.getSvgIconFontSize} 0)`
        }
      }
    },

    /**
     * 监听字体大小变化，重新计算样式
     */
    fontSize: {
      handler() {
        this.getSvgIconImgStyle()
      }
    }
  },

  /**
   * 组件创建时执行
   */
  created() {
    this.getSvgIconImgStyle()
    this.classRandom = Math.random().toString(36).slice(-9)
  },

  methods: {
    /**
     * 进行当前字体样式的加载路径进行拼接封装处理
     * @returns {String} 处理后的SVG文件路径
     */
    getSvgIconImgSrc() {
      let _file = this.file

      if (_file) {
        // 判断当前传入的是文件路径，还是默认路径下的文件名称（是文件名称进行默认路径的拼接操作）
        if (_file.indexOf('\\') === -1 && _file.indexOf('/') === -1) {
          _file = this.BaseFilePath + _file
        }

        // 如果没有文件后缀，则进行文件后缀的拼接处理
        if (!_file.endsWith('.svg')) {
          _file += '.svg'
        }
      } else {
        console.log('svg-icon组件传入的file不能为空')
      }

      return _file
    },

    /**
     * 进行当前组件的div标签（img标签父节点）样式拼接操作，控制字体样式显示正确
     * @returns {Object} 计算后的div样式
     */
    getSvgIconDivStyle() {
      const _fontSize = this.getSvgIconFontSize,
          _style = {
            overflow: 'hidden',
            width: _fontSize,
            height: _fontSize,
            'line-height': _fontSize,
          }

      // 未能正确的进行file的参数传递会导致svg-icon组件隐藏
      if (_fontSize === '0px') {
        _style.display = 'none'
      }

      return _style
    },

    /**
     * 进行当前组件的img标签样式拼接操作，控制字体样式显示正确
     */
    getSvgIconImgStyle() {
      const _fontSize = this.getSvgIconFontSize,
          _style = {
            width: _fontSize,
            height: _fontSize,
          }
      let _color = this.color

      // hover 时优先用 hoverColor
      if (this.isHover && this.hoverColor) {
        _color = this.hoverColor
      }
      if (_color) {
        _style.transform = `translateX(-${_fontSize})`
        _style.filter = `drop-shadow(${_color} ${_fontSize} 0)`
      }

      this.svgIconImgStyle = _style
    },
    handleMouseEnter() {
      this.isHover = true
      this.getSvgIconImgStyle()
      this.mouseEnter()
    },
    handleMouseLeave() {
      this.isHover = false
      this.getSvgIconImgStyle()
      this.mouseLeave()
    },
  }
}
</script>

<style scoped>
.svg-icon {
  display: inline-block;
}
</style>