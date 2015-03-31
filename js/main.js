$(document).ready(function(){

	// Preloader Calls

	// startLoader();

	// $('.enter-site-button').click(enterSite);

	// $( '.preloader' ).scroll(function() {

	// 	var elem = $("#preloader");
	// 	if (elem.hasClass ("loaded")) {
	// 		enterSite();
	// 	};
			
	// });


	// Init Functions

	setHeight();
	fullPageInit();

});


// ----- Preloader

function startLoader() {

    var loader = new PxLoader(), 
        backgroundImg = loader.addImage('img/assasin.jpg'), 
        backgroundImgTwo = loader.addImage('img/city.jpg');
     
    // callback that will be run once images are ready 
    loader.addCompletionListener(function() { 
	    
    	setTimeout(function() {
	        $('.preloader').addClass('loaded');
	        preloaderScroll();

	    	console.log("loaded");

    	}, 2500);
        
    });

    loader.start();

};

function preloaderScroll() {
	var elem = $('.scroll-catch');
	var initHeight = elem.height();

	elem.css('height', initHeight * 1.1);
	console.log('scroll caught');
	
};


// ----- Window Height Objects

function setHeight() {

    var windowHeight = $(window).innerHeight();

    $('.full-height').css('height', windowHeight);
    $('.min-full-height').css('min-height', windowHeight);

};
  
$(window).resize(function() {
    setHeight();

    if( $('.scroll-catch').height() > 1 ) {
    	preloaderScroll();
    };
    
});


// ----- Entering Site

function enterSite() {

	$('#wrapper').removeClass('hidden').addClass('entered');

	$('.preloader').addClass('entered');

	preloaderRemove();

	console.log('entered');
	
};

function preloaderRemove() {
    setTimeout(function() {
        $('.preloader').remove();
    }, 1500);
};


function fullPageInit() {
	$('#fullpage').fullpage({

        //Navigation
        menu: '#menu',
        anchors:['1stPage', '2ndPage', '3rdPage', '4thPage', '5thPage'],

        // //Scrolling
        css3: true,
        scrollingSpeed: 700,
        autoScrolling: true,
        // fitToSection: true,
        scrollBar: true,
        easing: 'easeInOutCubic',
        easingcss3: 'ease',
        loopBottom: false,
        loopTop: false,
        normalScrollElements: '.preloader',
        scrollOverflow: true,
        touchSensitivity: 8,
        normalScrollElementTouchThreshold: 5,

        //Accessibility
        keyboardScrolling: true,
        animateAnchor: true,
        recordHistory: true,

        // //Design
        // controlArrows: true,
        verticalCentered: true,
        // resize : false,
        // //sectionsColor : ['#ccc', '#fff'],
        // paddingTop: '3em',
        // paddingBottom: '10px',
        responsive: 480

    });

};